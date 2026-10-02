import { execFile } from "node:child_process"
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import { buscarFfmpeg } from "@/lib/video/ffmpeg"

const ejecutar = promisify(execFile)

export interface Fotograma {
  segundo: number
  jpeg: Uint8Array
}

export interface LineaDePantalla {
  desde: number
  hasta: number
  texto: string
}

const ANCHO_FOTOGRAMA = 720
const ESPERA_FFMPEG_MS = 5 * 60_000
const SALIDA_MAXIMA_BYTES = 64 * 1024 * 1024

// Difference hash: 9x8 gray samples give 8x8 comparisons between horizontal neighbours.
const COLUMNAS = 9
const FILAS = 8
const BYTES_POR_HASH = COLUMNAS * FILAS
const BYTES_DE_MUESTRA = BYTES_POR_HASH * 2
// Subtitles live in the bottom 40% of a vertical video.
const FRACCION_FRANJA_INICIO = 0.6
// Max differing bits (of 64) for two frames to count as the same picture. A new subtitle line flips several bits
// of the band hash; a re-encoding artefact flips almost none.
export const UMBRAL_FRANJA = 4
export const UMBRAL_COMPLETO = 8

// Near-identical lines (one misread letter) are the same line.
export const SIMILITUD_MINIMA_DE_LINEA = 0.85

async function elegirFfmpeg(ffmpeg: string | undefined): Promise<string> {
  const elegido = ffmpeg ?? (await buscarFfmpeg())
  if (!elegido) throw new FallaDeConfiguracion("No encuentro ffmpeg para leer el video.")
  return elegido
}

async function enCarpetaTemporal<T>(trabajo: (carpeta: string) => Promise<T>): Promise<T> {
  const carpeta = await mkdtemp(join(tmpdir(), "coni-fotogramas-"))
  try {
    return await trabajo(carpeta)
  } finally {
    await rm(carpeta, { recursive: true, force: true })
  }
}

/** One JPEG every `cadaSegundos` seconds, 720 px wide. */
export async function extraerFotogramas(
  video: Uint8Array,
  opciones: { cadaSegundos: number; ffmpeg?: string },
): Promise<Fotograma[]> {
  const ffmpeg = await elegirFfmpeg(opciones.ffmpeg)
  return enCarpetaTemporal(async (carpeta) => {
    await writeFile(join(carpeta, "video.mp4"), video)
    await ejecutar(
      ffmpeg,
      [
        "-hide_banner",
        "-v",
        "error",
        "-i",
        "video.mp4",
        "-vf",
        `fps=1/${opciones.cadaSegundos},scale=${ANCHO_FOTOGRAMA}:-2`,
        "-q:v",
        "4",
        "cuadro-%05d.jpg",
      ],
      { cwd: carpeta, timeout: ESPERA_FFMPEG_MS },
    )
    const archivos = (await readdir(carpeta)).filter((nombre) => nombre.startsWith("cuadro-")).sort()
    return Promise.all(
      archivos.map(async (archivo, indice) => ({
        segundo: indice * opciones.cadaSegundos,
        jpeg: new Uint8Array(await readFile(join(carpeta, archivo))),
      })),
    )
  })
}

export interface HashesDeFotograma {
  franja: string
  completo: string
}

function dHash(muestra: Uint8Array, desde: number): string {
  let hash = ""
  for (let fila = 0; fila < FILAS; fila++) {
    for (let columna = 0; columna < COLUMNAS - 1; columna++) {
      const izquierda = muestra[desde + fila * COLUMNAS + columna] ?? 0
      const derecha = muestra[desde + fila * COLUMNAS + columna + 1] ?? 0
      hash += izquierda > derecha ? "1" : "0"
    }
  }
  return hash
}

/** The two dHashes of a 9x16 gray sample: the bottom band in the first 72 bytes, the whole frame in the last 72. */
export function hashesDeMuestra(muestra: Uint8Array): HashesDeFotograma {
  if (muestra.length !== BYTES_DE_MUESTRA) {
    throw new Error(`La muestra de un fotograma debe tener ${BYTES_DE_MUESTRA} bytes y trae ${muestra.length}.`)
  }
  return { franja: dHash(muestra, 0), completo: dHash(muestra, BYTES_POR_HASH) }
}

/** Number of positions where two equal-length bit strings differ. */
export function distanciaHamming(a: string, b: string): number {
  let bits = 0
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) bits++
  return bits
}

// Band and whole frame, each shrunk to 9x8 gray and stacked: one ffmpeg pass gives both samples.
const FILTRO_DE_MUESTRA = [
  "split[a][b]",
  `[a]crop=iw:ih*${1 - FRACCION_FRANJA_INICIO}:0:ih*${FRACCION_FRANJA_INICIO},scale=${COLUMNAS}:${FILAS}:flags=area,format=gray[franja]`,
  `[b]scale=${COLUMNAS}:${FILAS}:flags=area,format=gray[completo]`,
  "[franja][completo]vstack",
].join(";")

async function muestraDe(ffmpeg: string, carpeta: string, indice: number, jpeg: Uint8Array): Promise<Uint8Array> {
  const archivo = join(carpeta, `cuadro-${indice}.jpg`)
  await writeFile(archivo, jpeg)
  const { stdout } = await ejecutar(
    ffmpeg,
    ["-hide_banner", "-v", "error", "-i", archivo, "-vf", FILTRO_DE_MUESTRA, "-frames:v", "1", "-f", "rawvideo", "-"],
    { encoding: "buffer", maxBuffer: SALIDA_MAXIMA_BYTES, timeout: ESPERA_FFMPEG_MS },
  )
  return new Uint8Array(stdout)
}

/** Drops each frame that looks like the previous kept one, in its subtitle band and as a whole. */
export async function deduplicarFotogramas(
  fotogramas: readonly Fotograma[],
  opciones: { ffmpeg?: string } = {},
): Promise<Fotograma[]> {
  if (fotogramas.length === 0) return []
  const ffmpeg = await elegirFfmpeg(opciones.ffmpeg)
  return enCarpetaTemporal(async (carpeta) => {
    const conservados: Fotograma[] = []
    let anterior: HashesDeFotograma | undefined
    for (const [indice, fotograma] of fotogramas.entries()) {
      const hashes = hashesDeMuestra(await muestraDe(ffmpeg, carpeta, indice, fotograma.jpeg))
      const repetido =
        anterior !== undefined &&
        distanciaHamming(hashes.franja, anterior.franja) <= UMBRAL_FRANJA &&
        distanciaHamming(hashes.completo, anterior.completo) <= UMBRAL_COMPLETO
      if (!repetido) {
        conservados.push(fotograma)
        anterior = hashes
      }
    }
    return conservados
  })
}

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
}

function distanciaDeEdicion(a: string, b: string): number {
  let fila = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const nueva = [i]
    for (let j = 1; j <= b.length; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1
      nueva[j] = Math.min((fila[j] ?? 0) + 1, (nueva[j - 1] ?? 0) + 1, (fila[j - 1] ?? 0) + costo)
    }
    fila = nueva
  }
  return fila[b.length] ?? 0
}

function sonLaMismaLinea(a: string, b: string): boolean {
  const largo = Math.max(a.length, b.length)
  return largo === 0 || 1 - distanciaDeEdicion(a, b) / largo >= SIMILITUD_MINIMA_DE_LINEA
}

/** Merges consecutive readings of the same line into one span. An empty reading ends the span. */
export function unirLineasDePantalla(lecturas: readonly { segundo: number; texto: string }[]): LineaDePantalla[] {
  const lineas: LineaDePantalla[] = []
  let normalizadaActual: string | undefined
  for (const { segundo, texto } of lecturas) {
    const normalizada = normalizar(texto)
    if (normalizada === "") {
      normalizadaActual = undefined
      continue
    }
    const ultima = lineas.at(-1)
    if (ultima && normalizadaActual !== undefined && sonLaMismaLinea(normalizadaActual, normalizada)) {
      ultima.hasta = segundo
    } else {
      lineas.push({ desde: segundo, hasta: segundo, texto })
      normalizadaActual = normalizada
    }
  }
  return lineas
}
