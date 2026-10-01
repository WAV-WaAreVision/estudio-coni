import { z } from "zod"
import { Falla } from "@/lib/dominio/falla"
import { ALTO_REEL, ANCHO_REEL } from "@/lib/dominio/subtitulos"

export const DURACION_MINIMA_S = 5
export const DURACION_MAXIMA_S = 90
/** Design "Chequeos del video": under 300 MB. Binary megabytes, like the 32 MB asset limit of coni.py. */
export const LIMITE_BYTES = 300 * 1024 * 1024

export interface InfoVideo {
  duracion: number
  ancho: number
  alto: number
  conAudio: boolean
  bytes: number
}

export interface HallazgoDeVideo {
  regla: "duracion" | "formato" | "audio" | "tamano"
  /** Every video check blocks: Coni never gets to approve a video that fails one. */
  tipo: "bloquea"
  mensaje: string
}

function segundos(valor: number): string {
  return String(Math.round(valor * 10) / 10)
}

/** The automatic checks of the design before a video reaches gate 2: 5 to 90 s, 1080x1920, audio, under 300 MB. */
export function revisarVideo(info: InfoVideo): HallazgoDeVideo[] {
  const hallazgos: HallazgoDeVideo[] = []
  const bloquea = (regla: HallazgoDeVideo["regla"], mensaje: string) =>
    hallazgos.push({ regla, tipo: "bloquea", mensaje })

  // Written as a positive range so that NaN fails it.
  if (!(info.duracion >= DURACION_MINIMA_S && info.duracion <= DURACION_MAXIMA_S)) {
    bloquea(
      "duracion",
      `El video dura ${segundos(info.duracion)} s y tiene que durar entre ${DURACION_MINIMA_S} y ${DURACION_MAXIMA_S} s.`,
    )
  }
  if (info.ancho !== ANCHO_REEL || info.alto !== ALTO_REEL) {
    bloquea(
      "formato",
      `El video mide ${info.ancho}x${info.alto} y tiene que ser vertical de ${ANCHO_REEL}x${ALTO_REEL}.`,
    )
  }
  if (!info.conAudio) {
    bloquea("audio", "El video no tiene audio.")
  }
  if (!(info.bytes > 0 && info.bytes < LIMITE_BYTES)) {
    bloquea(
      "tamano",
      info.bytes > 0
        ? `El video pesa ${Math.round(info.bytes / 1024 / 1024)} MB y tiene que pesar menos de 300 MB.`
        : "El video quedó vacío.",
    )
  }
  return hallazgos
}

const NoSePuedeLeer = () => new Falla("No pude leer el video que quedó listo. Prueba de nuevo.")

const Flujo = z.object({
  codec_type: z.string(),
  width: z.number().optional(),
  height: z.number().optional(),
  duration: z.string().optional(),
})

const Sonda = z.object({
  streams: z.array(Flujo),
  format: z.object({ duration: z.string().optional(), size: z.string() }),
})

function numero(texto: string | undefined): number | undefined {
  if (texto === undefined || texto.trim() === "") return undefined
  const valor = Number(texto)
  return Number.isFinite(valor) ? valor : undefined
}

/** Reads the output of `ffprobe -v error -show_streams -show_format -of json`. */
export function infoDesdeFfprobe(json: unknown): InfoVideo {
  const sonda = Sonda.safeParse(json)
  if (!sonda.success) throw NoSePuedeLeer()
  const { streams, format } = sonda.data
  const video = streams.find((flujo) => flujo.codec_type === "video")
  const bytes = numero(format.size)
  const duracion = numero(format.duration) ?? numero(video?.duration)
  if (
    !video ||
    video.width === undefined ||
    video.height === undefined ||
    bytes === undefined ||
    duracion === undefined
  ) {
    throw NoSePuedeLeer()
  }
  return {
    duracion,
    ancho: video.width,
    alto: video.height,
    conAudio: streams.some((flujo) => flujo.codec_type === "audio"),
    bytes,
  }
}
