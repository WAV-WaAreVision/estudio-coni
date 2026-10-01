import { z } from "zod"
import { Falla, FallaDeConfiguracion } from "@/lib/dominio/falla"
import { codigoErrorHeygen, mensajeErrorHeygen } from "@/lib/proveedores/errores"
import type { PedidoHeygen } from "@/lib/proveedores/heygen"

// HeyGen v3 only (repo rule: no v1/v2). Every call below cites the page of the official reference it follows.
// Authentication: header `X-Api-Key`, https://developers.heygen.com/docs/api-key.md
// Error body `{ "error": { "code", "message", "doc_url" } }` and its codes: https://developers.heygen.com/docs/error-codes.md
const BASE = "https://api.heygen.com"

/** Largest file a HeyGen asset accepts (https://developers.heygen.com/reference/upload-asset.md; same as coni.py). */
export const LIMITE_ASSET_BYTES = 32 * 1024 * 1024

/**
 * `error.code` of a rejected request (HTTP 400, https://developers.heygen.com/docs/error-codes.md). The docs do not
 * list the `failure_code` values of a failed video, so this same code is what a failed video is matched against.
 */
export const CODIGO_POLITICA = "content_policy_violation"

// A render is minutes of HeyGen's time, but the calls themselves are quick; an upload moves up to 32 MB.
const ESPERA_ASSET_MS = 120_000
const ESPERA_CREAR_MS = 60_000
const ESPERA_LEER_MS = 30_000
const ESPERA_BAJAR_MS = 180_000

/** HeyGen refused a sentence of the script. Coni can fix it, so the message is written for her. */
export class PoliticaDeContenido extends Falla {
  constructor() {
    super("HeyGen no aceptó una frase del guion. Revísalo y vuelve a aprobarlo.")
    this.name = "PoliticaDeContenido"
  }
}

export type EstadoVideo =
  | { estado: "pendiente" | "procesando" }
  | { estado: "listo"; videoUrl: string; subtitleUrl?: string; duracion?: number }
  | { estado: "fallido"; fallo: { codigo: string; mensaje: string } }

function sinLlave(texto: string, clave: string): string {
  return clave ? texto.split(clave).join("[llave]") : texto
}

/**
 * What each answer means to the retry policy. A 4xx that is not "too early", "conflict" or "too many requests" will
 * not change by retrying, so it is for WAV; the rest is a plain Error, which Trigger.dev retries.
 */
async function errorDeRespuesta(respuesta: Response, clave: string): Promise<Error> {
  // Redacted before parsing and capping: a key cut in half by the 400-character cap would leak a prefix.
  const cuerpo = sinLlave(await respuesta.text(), clave)
  const { status } = respuesta
  const mensaje = `HeyGen respondió HTTP ${status}: ${mensajeErrorHeygen(cuerpo)}`
  if (codigoErrorHeygen(cuerpo) === CODIGO_POLITICA) return new PoliticaDeContenido()
  if (status === 402) {
    return new Falla("Tu cuenta de HeyGen no tiene créditos para este video. Revisa tu plan y vuelve a intentarlo.")
  }
  const definitivo = status >= 400 && status < 500 && status !== 408 && status !== 409 && status !== 429
  return definitivo ? new FallaDeConfiguracion(mensaje) : new Error(mensaje)
}

async function pedir(url: string, init: RequestInit, esperaMs: number, clave: string): Promise<unknown> {
  let respuesta: Response
  try {
    respuesta = await fetch(url, { ...init, signal: AbortSignal.timeout(esperaMs) })
  } catch (error) {
    // Network drops and timeouts are plain errors on purpose: Trigger.dev retries them.
    throw new Error("No pude conectar con HeyGen.", { cause: error })
  }
  if (!respuesta.ok) {
    throw await errorDeRespuesta(respuesta, clave)
  }
  try {
    return await respuesta.json()
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("HeyGen devolvió una respuesta ilegible.", { cause: error })
    throw error
  }
}

function leerRespuesta<T>(esquema: z.ZodType<T>, cuerpo: unknown, ruta: string): T {
  const resultado = esquema.safeParse(cuerpo)
  if (!resultado.success) {
    throw new Error(`HeyGen devolvió una respuesta inesperada en ${ruta}.`)
  }
  return resultado.data
}

function cabeceras(clave: string, idempotencia: string | undefined, extra: Record<string, string> = {}) {
  const cabecerasBase: Record<string, string> = { "X-Api-Key": clave, ...extra }
  // https://developers.heygen.com/reference/create-video.md and upload-asset.md: replayed for 24 h under the same key.
  if (idempotencia) cabecerasBase["Idempotency-Key"] = idempotencia
  return cabecerasBase
}

const EXTENSION_POR_TIPO: Record<string, string> = { "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-wav": "wav" }

const RespuestaAsset = z.object({ data: z.object({ asset_id: z.string().min(1) }) })

/**
 * Uploads Route B's audio and returns the asset id for `audio_asset_id`.
 * https://developers.heygen.com/reference/upload-asset.md : `POST /v3/assets`, multipart field `file`, up to 32 MB,
 * answers `{ data: { asset_id, url, mime_type, size_bytes } }`.
 */
export async function subirAsset(entrada: {
  clave: string
  datos: Uint8Array
  tipo: string
  idempotencia?: string
}): Promise<string> {
  const { clave, datos, tipo } = entrada
  if (datos.byteLength > LIMITE_ASSET_BYTES) {
    // A plain Error: no retry or config change shrinks the file, and a size is not a configuration problem.
    throw new Error(`El archivo pesa ${datos.byteLength} bytes y HeyGen acepta hasta 32 MB por asset.`)
  }
  const formulario = new FormData()
  const extension = EXTENSION_POR_TIPO[tipo] ?? "bin"
  // A copy: `File` wants a buffer it can own, and the caller may reuse theirs.
  formulario.append("file", new File([datos.slice()], `audio.${extension}`, { type: tipo }))
  // No Content-Type: fetch sets the multipart boundary itself.
  const cuerpo = await pedir(
    `${BASE}/v3/assets`,
    { method: "POST", headers: cabeceras(clave, entrada.idempotencia), body: formulario },
    ESPERA_ASSET_MS,
    clave,
  )
  return leerRespuesta(RespuestaAsset, cuerpo, "/v3/assets").data.asset_id
}

const RespuestaCrear = z.object({ data: z.object({ video_id: z.string().min(1) }) })

/**
 * Creates the avatar video (this is the call that charges) and returns its id.
 * https://developers.heygen.com/reference/create-video.md : `POST /v3/videos`, answers `{ data: { video_id, status } }`.
 * `callback_url` is a documented field ("Webhook URL to receive a POST notification when the video is ready"), sent
 * only when the caller has one. The same page documents the `Idempotency-Key` header: a replay under the same key
 * within 24 h returns the first answer instead of charging again.
 */
export async function crearVideo(entrada: {
  clave: string
  pedido: PedidoHeygen
  callbackUrl?: string
  idempotencia?: string
}): Promise<string> {
  const { clave, pedido, callbackUrl } = entrada
  const cuerpo = callbackUrl ? { ...pedido, callback_url: callbackUrl } : pedido
  const respuesta = await pedir(
    `${BASE}/v3/videos`,
    {
      method: "POST",
      headers: cabeceras(clave, entrada.idempotencia, { "Content-Type": "application/json" }),
      body: JSON.stringify(cuerpo),
    },
    ESPERA_CREAR_MS,
    clave,
  )
  return leerRespuesta(RespuestaCrear, respuesta, "/v3/videos").data.video_id
}

const RespuestaVideo = z.object({
  data: z.object({
    status: z.string(),
    video_url: z.string().nullish(),
    subtitle_url: z.string().nullish(),
    duration: z.number().nullish(),
    failure_code: z.string().nullish(),
    failure_message: z.string().nullish(),
  }),
})

/**
 * Reads a video by id. https://developers.heygen.com/reference/get-video.md : `GET /v3/videos/{video_id}`, answers
 * `{ data: { id, status, video_url, subtitle_url, duration, failure_code, failure_message, ... } }`, where `status` is
 * `pending | processing | completed | failed`. The create answer says `waiting` and the quick start says
 * `generating` (https://developers.heygen.com/docs/quick-start); both are read as "not finished yet", the safe side.
 */
export async function leerVideo(entrada: { clave: string; videoId: string }): Promise<EstadoVideo> {
  const { clave, videoId } = entrada
  const ruta = `/v3/videos/${encodeURIComponent(videoId)}`
  const cuerpo = await pedir(
    `${BASE}${ruta}`,
    { method: "GET", headers: cabeceras(clave, undefined) },
    ESPERA_LEER_MS,
    clave,
  )
  const video = leerRespuesta(RespuestaVideo, cuerpo, "/v3/videos/{id}").data
  switch (video.status) {
    case "pending":
    case "waiting":
      return { estado: "pendiente" }
    case "processing":
    case "generating":
      return { estado: "procesando" }
    case "completed": {
      if (!video.video_url) {
        throw new Error("HeyGen marcó el video como completo pero no trae video_url.")
      }
      return {
        estado: "listo",
        videoUrl: video.video_url,
        ...(video.subtitle_url ? { subtitleUrl: video.subtitle_url } : {}),
        ...(typeof video.duration === "number" ? { duracion: video.duration } : {}),
      }
    }
    case "failed":
      return {
        estado: "fallido",
        fallo: { codigo: video.failure_code || "desconocido", mensaje: video.failure_message || "sin detalle" },
      }
    default:
      // A status the docs do not list: a plain Error, so the retry reads it again instead of guessing.
      throw new Error(`HeyGen devolvió un estado desconocido para el video: ${video.status}`)
  }
}

/** Downloads a presigned URL of HeyGen (video, SRT). No auth header: the signature is in the URL. */
export async function bajar(url: string): Promise<Uint8Array> {
  // The query holds the signature, so only the host goes into messages and logs.
  const anfitrion = new URL(url).host
  let respuesta: Response
  try {
    respuesta = await fetch(url, { signal: AbortSignal.timeout(ESPERA_BAJAR_MS) })
  } catch (error) {
    throw new Error(`No pude bajar el archivo de ${anfitrion}.`, { cause: error })
  }
  if (!respuesta.ok) {
    throw new Error(`No pude bajar el archivo de ${anfitrion}: HTTP ${respuesta.status}.`)
  }
  const datos = new Uint8Array(await respuesta.arrayBuffer())
  if (datos.length === 0) {
    throw new Error(`El archivo de ${anfitrion} llegó vacío.`)
  }
  return datos
}
