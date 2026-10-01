import { execFile } from "node:child_process"
import { access, constants, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { delimiter, dirname, join, resolve } from "node:path"
import { promisify } from "node:util"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import { assDe, FUENTE_SUBTITULO } from "@/lib/dominio/subtitulos"
import { type InfoVideo, infoDesdeFfprobe } from "@/lib/video/chequeos"

const ejecutar = promisify(execFile)

/** Same candidates as `FFMPEG_FULL` in coni.py: the Homebrew `ffmpeg-full` formula is the one built with libass. */
export const RUTAS_FFMPEG_FULL = [
  "/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg",
  "/usr/local/opt/ffmpeg-full/bin/ffmpeg",
] as const

type Entorno = Record<string, string | undefined>

const ESPERA_QUEMAR_MS = 10 * 60_000
const ESPERA_SONDEAR_MS = 60_000
const ESPERA_FUENTE_MS = 60_000
// ffmpeg -v verbose is chatty; the fontselect line is somewhere in the middle of it.
const SALIDA_MAXIMA_BYTES = 64 * 1024 * 1024
const ERROR_MAXIMO = 400

async function existe(ruta: string): Promise<boolean> {
  try {
    await access(ruta, constants.X_OK)
    return true
  } catch {
    // Not there or not executable: for a search, that is simply "not a candidate".
    return false
  }
}

async function tieneSubtitulos(ffmpeg: string): Promise<boolean> {
  try {
    const { stdout } = await ejecutar(ffmpeg, ["-hide_banner", "-filters"], { encoding: "utf8", timeout: 30_000 })
    // Same test as coni.py: a line of the filter list whose name is `subtitles` (it needs libass).
    return /^\s*\S*\s+subtitles\s/m.test(stdout)
  } catch {
    // A candidate that cannot run is not a candidate; the search goes on with the next one.
    return false
  }
}

/**
 * The first ffmpeg that has the `subtitles` filter (libass), like `buscar_ffmpeg` in coni.py: `CONI_FFMPEG`, then
 * `FFMPEG_PATH` (what Trigger.dev's `ffmpeg()` build extension sets in the container), the `ffmpeg-full` formulas of
 * Homebrew and finally `ffmpeg` on the PATH. Null when none has it.
 */
export async function buscarFfmpeg(
  entorno: Entorno = process.env,
  fijos: readonly string[] = RUTAS_FFMPEG_FULL,
): Promise<string | null> {
  const delPath = (entorno.PATH ?? "")
    .split(delimiter)
    .filter(Boolean)
    .map((carpeta) => join(carpeta, "ffmpeg"))
  const candidatos = [entorno.CONI_FFMPEG, entorno.FFMPEG_PATH, ...fijos, ...delPath]
  for (const ruta of new Set(candidatos.filter((c): c is string => Boolean(c)))) {
    if ((await existe(ruta)) && (await tieneSubtitulos(ruta))) return ruta
  }
  return null
}

/** `FFPROBE_PATH` (set by the same build extension), the ffprobe next to the ffmpeg that was found, or the PATH's. */
export async function buscarFfprobe(ffmpeg: string, entorno: Entorno = process.env): Promise<string> {
  if (entorno.FFPROBE_PATH) return entorno.FFPROBE_PATH
  const vecino = join(dirname(ffmpeg), "ffprobe")
  return (await existe(vecino)) ? vecino : "ffprobe"
}

interface ErrorDeProceso {
  message: string
  stderr?: unknown
  code?: unknown
  signal?: unknown
}

/** A plain Error: a failed encode is retried by Trigger.dev, which downloads the video again. */
function falloDeProceso(programa: string, error: unknown): Error {
  const detalle: ErrorDeProceso =
    typeof error === "object" && error !== null && "message" in error && typeof error.message === "string"
      ? { ...error, message: error.message }
      : { message: String(error) }
  const stderr = typeof detalle.stderr === "string" ? detalle.stderr.trim() : ""
  const motivo = stderr
    ? stderr.slice(-ERROR_MAXIMO)
    : `sin salida (${String(detalle.signal ?? detalle.code ?? detalle.message).slice(0, ERROR_MAXIMO)})`
  return new Error(`${programa} falló: ${motivo}`, { cause: error })
}

async function enCarpetaTemporal<T>(trabajo: (carpeta: string) => Promise<T>): Promise<T> {
  const carpeta = await mkdtemp(join(tmpdir(), "coni-video-"))
  try {
    return await trabajo(carpeta)
  } finally {
    await rm(carpeta, { recursive: true, force: true })
  }
}

// The same link name every time: the filter argument never holds a path that could need escaping. ffmpeg runs with the
// temporary folder as its working directory (coni.py does the same), and `fuentes` points at the real fonts folder.
const ENLACE_DE_FUENTES = "fuentes"

async function prepararCarpeta(carpeta: string, ass: string, fontsdir: string): Promise<void> {
  await writeFile(join(carpeta, "subtitulos.ass"), ass, "utf8")
  await symlink(resolve(fontsdir), join(carpeta, ENLACE_DE_FUENTES), "dir")
}

const FILTRO = `subtitles=subtitulos.ass:fontsdir=${ENLACE_DE_FUENTES}`

/**
 * Burns the ASS subtitles into the video and returns the final mp4. Same arguments as `cmd_subtitulos` in coni.py;
 * `fontsdir` is explicit so libass finds Montserrat in the container instead of guessing (design Q3).
 */
export async function quemarSubtitulos(entrada: {
  ffmpeg: string
  video: Uint8Array
  ass: string
  fontsdir: string
}): Promise<Uint8Array> {
  const { ffmpeg, video, ass, fontsdir } = entrada
  return enCarpetaTemporal(async (carpeta) => {
    await writeFile(join(carpeta, "video.mp4"), video)
    await prepararCarpeta(carpeta, ass, fontsdir)
    try {
      await ejecutar(
        ffmpeg,
        [
          "-hide_banner",
          "-v",
          "error",
          "-y",
          "-i",
          "video.mp4",
          "-vf",
          FILTRO,
          "-c:v",
          "libx264",
          "-preset",
          "medium",
          "-crf",
          "21",
          "-pix_fmt",
          "yuv420p",
          "-c:a",
          "copy",
          "-movflags",
          "+faststart",
          "video-final.mp4",
        ],
        { cwd: carpeta, encoding: "utf8", timeout: ESPERA_QUEMAR_MS, maxBuffer: SALIDA_MAXIMA_BYTES },
      )
    } catch (error) {
      throw falloDeProceso("ffmpeg", error)
    }
    return new Uint8Array(await readFile(join(carpeta, "video-final.mp4")))
  })
}

export interface FuenteElegida {
  /** The family the style asked for. */
  familia: string
  peso: number
  /** What libass picked: a file path with fontconfig, a font name with CoreText. */
  archivo: string
  /** The PostScript name of the face it picked, e.g. `Montserrat-Bold`. */
  nombre: string
}

/**
 * Reads the `fontselect` line libass writes with `ffmpeg -v verbose`, e.g.
 * `[Parsed_subtitles_0 @ 0x7c107ccc0] fontselect: (Montserrat, 700, 0) -> Montserrat-Bold, 0, Montserrat-Bold`.
 */
export function leerFontselect(salida: string): FuenteElegida | null {
  const linea = /fontselect: \((.+?), (\d+), -?\d+\) -> (.+), -?\d+, (.*)$/m.exec(salida)
  if (!linea) return null
  const [, familia, peso, archivo, nombre] = linea
  return { familia, peso: Number(peso), archivo, nombre: nombre.trim() }
}

const PRIMER_DIALOGO = /^Dialogue: \d+,(\d+):(\d{2}):(\d{2})\.(\d{2}),/m

/**
 * Renders one frame of the first cue of `ass` with the same filter as the burn and says which face libass chose for
 * the style. libass picks a face by name and can settle for another variant without a word (a machine with Adobe
 * Fonts picks Montserrat Black), so the container checks this before it burns anything (design Q3).
 */
export async function fuenteElegida(entrada: {
  ffmpeg: string
  ass: string
  fontsdir: string
}): Promise<FuenteElegida> {
  const { ffmpeg, ass, fontsdir } = entrada
  const dialogo = PRIMER_DIALOGO.exec(ass)
  if (!dialogo) {
    throw new Error("Los subtítulos no tienen ningún diálogo: no hay nada con qué probar la fuente.")
  }
  const [, h, m, s, cs] = dialogo
  const inicio = Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(cs) / 100
  return enCarpetaTemporal(async (carpeta) => {
    await prepararCarpeta(carpeta, ass, fontsdir)
    let salida: string
    try {
      // A black source long enough to reach the cue; two frames a second keep it cheap.
      const resultado = await ejecutar(
        ffmpeg,
        [
          "-hide_banner",
          "-v",
          "verbose",
          "-f",
          "lavfi",
          "-i",
          `color=c=black:s=1080x1920:r=2:d=${inicio + 1}`,
          "-vf",
          FILTRO,
          "-ss",
          String(inicio),
          "-frames:v",
          "1",
          "-f",
          "null",
          "-",
        ],
        { cwd: carpeta, encoding: "utf8", timeout: ESPERA_FUENTE_MS, maxBuffer: SALIDA_MAXIMA_BYTES },
      )
      salida = resultado.stderr
    } catch (error) {
      throw falloDeProceso("ffmpeg", error)
    }
    const fuente = leerFontselect(salida)
    if (!fuente) {
      throw new Error(`libass no eligió ninguna fuente para ${FUENTE_SUBTITULO}: no hay una línea fontselect.`)
    }
    return fuente
  })
}

/** The PostScript name of the face the ASS style asks for: family Montserrat, bold. */
export const FUENTE_ESPERADA = "Montserrat-Bold"

/**
 * Fails, before any credit is spent, when libass would not draw the subtitles in Montserrat Bold from `fontsdir`:
 * a container without the fonts folder, a renamed file, or a machine whose own fonts win. Probes with a cue of its own.
 */
export async function exigirMontserratBold(entrada: { ffmpeg: string; fontsdir: string }): Promise<FuenteElegida> {
  const { ffmpeg, fontsdir } = entrada
  const fuente = await fuenteElegida({ ffmpeg, ass: assDe([[0, 1, "Prueba"]]), fontsdir })
  if (fuente.nombre !== FUENTE_ESPERADA) {
    throw new FallaDeConfiguracion(
      `libass eligió ${fuente.nombre} en vez de ${FUENTE_ESPERADA} para los subtítulos. Revisa que ${fontsdir} tenga Montserrat-Bold.ttf (CONI_FONTSDIR).`,
    )
  }
  return fuente
}

/** Reads the video with `ffprobe -v error -show_streams -show_format -of json` and parses it. */
export async function sondear(entrada: { ffprobe: string; bytes: Uint8Array }): Promise<InfoVideo> {
  const { ffprobe, bytes } = entrada
  return enCarpetaTemporal(async (carpeta) => {
    const archivo = join(carpeta, "video-final.mp4")
    await writeFile(archivo, bytes)
    let salida: string
    try {
      const resultado = await ejecutar(
        ffprobe,
        ["-v", "error", "-show_streams", "-show_format", "-of", "json", archivo],
        { encoding: "utf8", timeout: ESPERA_SONDEAR_MS, maxBuffer: SALIDA_MAXIMA_BYTES },
      )
      salida = resultado.stdout
    } catch (error) {
      throw falloDeProceso("ffprobe", error)
    }
    let json: unknown
    try {
      json = JSON.parse(salida)
    } catch (error) {
      if (error instanceof SyntaxError) throw new Error("ffprobe no devolvió JSON.", { cause: error })
      throw error
    }
    return infoDesdeFfprobe(json)
  })
}
