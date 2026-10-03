import { execFile } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { z } from "zod"
import { Falla } from "@/lib/dominio/falla"
import { buscarFfprobe } from "@/lib/video/ffmpeg"

const ejecutar = promisify(execFile)

const ESPERA_MS = 10 * 60_000
const SALIDA_MAXIMA_BYTES = 16 * 1024 * 1024
// Claude shrinks anything wider anyway; sending less keeps a phone photo under the API's size limit and cheaper.
const ANCHO_MAXIMO_IMAGEN = 1568

async function enCarpeta<T>(trabajo: (carpeta: string) => Promise<T>): Promise<T> {
  const carpeta = await mkdtemp(join(tmpdir(), "coni-medios-"))
  try {
    return await trabajo(carpeta)
  } finally {
    await rm(carpeta, { recursive: true, force: true })
  }
}

/** The file cannot be read as media: Coni sees this as-is, and uploading it again is the fix. */
export class MedioIlegible extends Falla {
  constructor() {
    super("No pude leer el archivo. Revisa que no esté dañado y súbelo de nuevo.")
    this.name = "MedioIlegible"
  }
}

const Sonda = z.object({
  streams: z.array(z.object({ codec_type: z.string().optional() })),
  format: z.object({ duration: z.string().optional() }),
})

export interface InfoDeMedio {
  duracion: number
  conAudio: boolean
}

/** Duration and whether there is an audio stream, for audio and video alike (`sondear` only reads videos). */
export async function sondearMedio(entrada: { ffmpeg: string; bytes: Uint8Array }): Promise<InfoDeMedio> {
  const ffprobe = await buscarFfprobe(entrada.ffmpeg)
  return enCarpeta(async (carpeta) => {
    const archivo = join(carpeta, "medio")
    await writeFile(archivo, entrada.bytes)
    let salida: string
    try {
      const resultado = await ejecutar(
        ffprobe,
        ["-v", "error", "-show_streams", "-show_format", "-of", "json", archivo],
        { encoding: "utf8", timeout: 60_000, maxBuffer: SALIDA_MAXIMA_BYTES },
      )
      salida = resultado.stdout
    } catch (error) {
      throw new Error("ffprobe falló al leer el archivo.", { cause: error })
    }
    let json: unknown
    try {
      json = JSON.parse(salida)
    } catch (error) {
      if (error instanceof SyntaxError) throw new Error("ffprobe no devolvió JSON.", { cause: error })
      throw error
    }
    const sonda = Sonda.safeParse(json)
    const duracion = Number(sonda.success ? sonda.data.format.duration : Number.NaN)
    if (!sonda.success || !Number.isFinite(duracion)) throw new MedioIlegible()
    return { duracion, conAudio: sonda.data.streams.some((s) => s.codec_type === "audio") }
  })
}

/** The audio of a video as a small mono MP3: what Scribe needs, and an hour of it stays near 20 MB. */
export async function extraerAudio(entrada: { ffmpeg: string; video: Uint8Array }): Promise<Uint8Array> {
  return enCarpeta(async (carpeta) => {
    await writeFile(join(carpeta, "video"), entrada.video)
    try {
      await ejecutar(
        entrada.ffmpeg,
        ["-hide_banner", "-v", "error", "-i", "video", "-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k", "audio.mp3"],
        { cwd: carpeta, timeout: ESPERA_MS },
      )
    } catch (error) {
      throw new Error("ffmpeg falló al extraer el audio.", { cause: error })
    }
    return new Uint8Array(await readFile(join(carpeta, "audio.mp3")))
  })
}

/** Any image ffmpeg reads (PNG, WebP, HEIC, JPEG) as a JPEG at most 1568 px wide, upright. */
export async function imagenAJpeg(entrada: {
  ffmpeg: string
  bytes: Uint8Array
  extension: string
}): Promise<Uint8Array> {
  return enCarpeta(async (carpeta) => {
    const origen = `origen.${entrada.extension}`
    await writeFile(join(carpeta, origen), entrada.bytes)
    try {
      await ejecutar(
        entrada.ffmpeg,
        [
          "-hide_banner",
          "-v",
          "error",
          "-i",
          origen,
          "-vf",
          `scale='min(${ANCHO_MAXIMO_IMAGEN},iw)':-2`,
          "-frames:v",
          "1",
          "-q:v",
          "3",
          "imagen.jpg",
        ],
        { cwd: carpeta, timeout: 5 * 60_000 },
      )
    } catch (error) {
      throw new Error("ffmpeg falló al convertir la imagen.", { cause: error })
    }
    return new Uint8Array(await readFile(join(carpeta, "imagen.jpg")))
  })
}
