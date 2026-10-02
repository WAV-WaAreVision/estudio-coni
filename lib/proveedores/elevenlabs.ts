import { z } from "zod"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import type { ConfigElevenlabs } from "@/lib/proveedores/config"
import { mensajeErrorElevenlabs } from "@/lib/proveedores/errores"

const BASE_POR_DEFECTO = "https://api.elevenlabs.io"
// Same limits as coni.py: a voice can take minutes, a lookup should not.
const ESPERA_VOZ_MS = 300_000
const ESPERA_VERIFICACION_MS = 30_000
// Long recordings (an hour or more) take Scribe several minutes to answer.
const ESPERA_TRANSCRIPCION_MS = 900_000
// scribe_v1 was removed by ElevenLabs on 2026-07-09.
const MODELO_TRANSCRIPCION = "scribe_v2"
const SEGMENTO_MAXIMO_SEGUNDOS = 30
// Scribe list price per hour of audio. Must be checked against the account's plan before trusting the estimate.
const USD_POR_HORA_TRANSCRIPCION = 0.4

/** Still a plain Error for the retry policy; the class only lets `verificarVoz` tell "no connection" apart. */
class SinConexion extends Error {
  constructor(cause: unknown) {
    super("No pude conectar con ElevenLabs.", { cause })
    this.name = "SinConexion"
  }
}

function baseDe(base: string | undefined): string {
  return (base ?? (process.env.ELEVENLABS_BASE_URL || BASE_POR_DEFECTO)).replace(/\/+$/, "")
}

function sinLlave(texto: string, clave: string): string {
  return clave ? texto.split(clave).join("[llave]") : texto
}

/** 4xx other than "too early" and "too many requests" will not change by retrying: they are for WAV. */
function esErrorDeConfiguracion(estado: number): boolean {
  return estado >= 400 && estado < 500 && estado !== 408 && estado !== 429
}

async function motivoDelError(respuesta: Response, clave: string): Promise<string> {
  // Redacted before parsing and capping: a key cut in half by the 400-character cap would leak a prefix.
  return mensajeErrorElevenlabs(sinLlave(await respuesta.text(), clave))
}

async function pedir<T>(
  url: string,
  init: RequestInit,
  esperaMs: number,
  leer: (respuesta: Response) => Promise<T>,
): Promise<T> {
  let respuesta: Response
  try {
    respuesta = await fetch(url, { ...init, signal: AbortSignal.timeout(esperaMs) })
  } catch (error) {
    // Network drops and timeouts are plain errors on purpose: Trigger.dev retries them.
    throw new SinConexion(error)
  }
  return leer(respuesta)
}

/** Speaks `texto` with Coni's cloned voice and returns the MP3 bytes. Same request as `cmd_voz` in coni.py. */
export async function generarVoz(entrada: {
  clave: string
  config: ConfigElevenlabs
  texto: string
  base?: string
}): Promise<Uint8Array> {
  const { clave, config, texto } = entrada
  if (!config.voice_id) {
    throw new FallaDeConfiguracion("Falta elevenlabs.voice_id en la configuración.")
  }
  const cuerpo: Record<string, unknown> = { text: texto, model_id: config.model_id }
  if (config.voice_settings && Object.keys(config.voice_settings).length > 0) {
    cuerpo.voice_settings = config.voice_settings
  }
  const url = `${baseDe(entrada.base)}/v1/text-to-speech/${encodeURIComponent(config.voice_id)}?output_format=${encodeURIComponent(config.output_format)}`

  return pedir(
    url,
    {
      method: "POST",
      headers: { "xi-api-key": clave, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify(cuerpo),
    },
    ESPERA_VOZ_MS,
    async (respuesta) => {
      if (!respuesta.ok) {
        const mensaje = `ElevenLabs respondió HTTP ${respuesta.status}: ${await motivoDelError(respuesta, clave)}`
        throw esErrorDeConfiguracion(respuesta.status) ? new FallaDeConfiguracion(mensaje) : new Error(mensaje)
      }
      const audio = new Uint8Array(await respuesta.arrayBuffer())
      if (audio.length === 0) {
        throw new Error("ElevenLabs devolvió un audio vacío.")
      }
      return audio
    },
  )
}

/** `http` is the status ElevenLabs answered with; it is absent when it could not be reached or the answer was unreadable. */
export type ResultadoVerificacion = { ok: true; nombre: string } | { ok: false; motivo: string; http?: number }

/** Looks the voice up the way `verificar` does in coni.py. A failure is a result, not an exception. */
export async function verificarVoz(entrada: {
  clave: string
  voiceId: string
  base?: string
}): Promise<ResultadoVerificacion> {
  const { clave, voiceId } = entrada
  try {
    return await pedir(
      `${baseDe(entrada.base)}/v1/voices/${encodeURIComponent(voiceId)}`,
      { method: "GET", headers: { "xi-api-key": clave } },
      ESPERA_VERIFICACION_MS,
      async (respuesta): Promise<ResultadoVerificacion> => {
        if (!respuesta.ok) {
          return {
            ok: false,
            http: respuesta.status,
            motivo: `HTTP ${respuesta.status} · ${await motivoDelError(respuesta, clave)} · Revisa el voice_id y que la llave tenga permiso de lectura de Voices.`,
          }
        }
        let datos: unknown
        try {
          datos = await respuesta.json()
        } catch (error) {
          if (error instanceof SyntaxError) return { ok: false, motivo: "ElevenLabs devolvió una respuesta ilegible." }
          throw error
        }
        const nombre =
          typeof datos === "object" && datos !== null && "name" in datos && typeof datos.name === "string"
            ? datos.name
            : "(sin nombre)"
        return { ok: true, nombre }
      },
    )
  } catch (error) {
    if (error instanceof SinConexion) return { ok: false, motivo: error.message }
    throw error
  }
}

const RespuestaScribe = z.object({
  language_code: z.string().min(1),
  words: z.array(z.object({ text: z.string(), start: z.number().optional(), type: z.string() })),
})

// Scribe may answer ISO 639-3 ("spa"); consumers expect ISO 639-1. Unknown codes pass through lowercased.
const IDIOMA_639_3_A_639_1: Record<string, string> = {
  spa: "es",
  eng: "en",
  por: "pt",
  fra: "fr",
  fre: "fr",
  deu: "de",
  ger: "de",
  ita: "it",
  cat: "ca",
  nld: "nl",
  rus: "ru",
  jpn: "ja",
  zho: "zh",
  kor: "ko",
}

export interface SegmentoTranscrito {
  segundo: number
  texto: string
}

// A period after these does not end a sentence. Spanish + English, compared case-insensitively.
const ABREVIATURAS = new Set([
  "dr.",
  "dra.",
  "sr.",
  "sra.",
  "srta.",
  "ud.",
  "uds.",
  "etc.",
  "p.ej.",
  "aprox.",
  "mr.",
  "mrs.",
  "ms.",
  "vs.",
  "e.g.",
  "i.e.",
])

function finDeOracion(texto: string): boolean {
  if (ABREVIATURAS.has(texto.toLowerCase())) return false
  return /[.!?…]["')\]]*$/.test(texto)
}

function agruparEnSegmentos(palabras: { text: string; start: number }[]): SegmentoTranscrito[] {
  const segmentos: SegmentoTranscrito[] = []
  let inicio = 0
  let actuales: string[] = []
  const cerrar = () => {
    if (actuales.length > 0) segmentos.push({ segundo: inicio, texto: actuales.join(" ") })
    actuales = []
  }
  for (const palabra of palabras) {
    if (actuales.length > 0 && palabra.start - inicio >= SEGMENTO_MAXIMO_SEGUNDOS) cerrar()
    if (actuales.length === 0) inicio = palabra.start
    actuales.push(palabra.text)
    if (finDeOracion(palabra.text)) cerrar()
  }
  cerrar()
  return segmentos
}

/** Transcribes `audio` with Scribe. The language is auto-detected and returned as ISO 639-1. */
export async function transcribir(entrada: {
  clave: string
  audio: Uint8Array
  tipo: string
  base?: string
}): Promise<{ idioma: string; segmentos: SegmentoTranscrito[] }> {
  const { clave } = entrada
  const formulario = new FormData()
  formulario.append("model_id", MODELO_TRANSCRIPCION)
  formulario.append("timestamps_granularity", "word")
  formulario.append("file", new Blob([new Uint8Array(entrada.audio)], { type: entrada.tipo }), "audio")

  return pedir(
    `${baseDe(entrada.base)}/v1/speech-to-text`,
    { method: "POST", headers: { "xi-api-key": clave }, body: formulario },
    ESPERA_TRANSCRIPCION_MS,
    async (respuesta) => {
      if (!respuesta.ok) {
        const mensaje = `ElevenLabs respondió HTTP ${respuesta.status}: ${await motivoDelError(respuesta, clave)}`
        throw esErrorDeConfiguracion(respuesta.status) ? new FallaDeConfiguracion(mensaje) : new Error(mensaje)
      }
      let datos: unknown
      try {
        datos = await respuesta.json()
      } catch (error) {
        if (error instanceof SyntaxError)
          throw new Error("ElevenLabs devolvió una transcripción ilegible.", { cause: error })
        throw error
      }
      const leido = RespuestaScribe.safeParse(datos)
      if (!leido.success) {
        throw new Error("ElevenLabs devolvió una transcripción con un formato inesperado.", { cause: leido.error })
      }
      const palabras = leido.data.words.flatMap((w) =>
        w.type === "word" && w.start !== undefined ? [{ text: w.text, start: w.start }] : [],
      )
      const codigo = leido.data.language_code.toLowerCase()
      return { idioma: IDIOMA_639_3_A_639_1[codigo] ?? codigo, segmentos: agruparEnSegmentos(palabras) }
    },
  )
}

/** Estimated cost in US$ of transcribing `segundos` of audio. */
export function estimarCostoTranscripcion(segundos: number): number {
  return (segundos / 3600) * USD_POR_HORA_TRANSCRIPCION
}
