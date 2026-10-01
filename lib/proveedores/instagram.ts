import { z } from "zod"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"

// Instagram API with Instagram Login (design D3/R1): every endpoint is on `graph.instagram.com`
// (https://developers.facebook.com/docs/instagram-platform/overview), versioned as in the docs' examples.
const BASE = "https://graph.instagram.com"
const VERSION = "v25.0"

// Errors follow https://developers.facebook.com/docs/graph-api/guides/error-handling :
// `{ "error": { "message", "type", "code", "error_subcode", "fbtrace_id" } }`.
// Code 190 (subcodes 458, 460, 463, 467) means a new token is needed.
const CODIGO_TOKEN = 190
// 10 and 200 to 299: a permission is missing and a person has to grant it.
const CODIGO_PERMISO = 10
// 1, 2, 4, 17, 341 and 368 are temporary according to the same page: they are retried.
const CODIGOS_TEMPORALES: readonly number[] = [1, 2, 4, 17, 341, 368]

const LARGO_MAXIMO = 400
const ESPERA_ESCRIBIR_MS = 60_000
const ESPERA_LEER_MS = 30_000

/** Written for Coni: she is the one who can reconnect her Instagram account (design A6). */
export const EXPLICACION_RECONECTAR =
  "Instagram pidió conectar de nuevo tu cuenta. Entra a Ajustes, vuelve a conectar Instagram y reintenta."

/** The token is expired or revoked. WAV sees the technical message; Coni gets `paraConi`. */
export class TokenVencido extends FallaDeConfiguracion {
  readonly paraConi = EXPLICACION_RECONECTAR
  constructor(mensaje: string) {
    super(mensaje)
    this.name = "TokenVencido"
  }
}

export type EstadoDeContenedor =
  | { estado: "en_proceso" | "listo" | "publicado" }
  | { estado: "error" | "expirado"; detalle: string }

export interface Publicacion {
  mediaId: string
  texto: string | null
  permalink: string | null
  tipoDeProducto: string | null
  /** `is_ai_generated` as Instagram returns it; null when the field did not come back. */
  etiquetaIa: boolean | null
}

function sinSecretos(texto: string, token: string): string {
  const sinToken = token ? texto.split(token).join("[token]") : texto
  // Signed URLs carry their signature in the query string.
  return sinToken.replace(/(https?:\/\/[^\s?]+)\?\S*/g, "$1")
}

const CuerpoDeError = z.object({
  error: z.object({
    message: z.string().optional(),
    code: z.number().optional(),
    error_subcode: z.number().optional(),
  }),
})

function clasificar(estado: number, cuerpo: string, token: string): Error {
  const limpio = sinSecretos(cuerpo, token).trim()
  let datos: z.infer<typeof CuerpoDeError>["error"] | undefined
  try {
    const leido = CuerpoDeError.safeParse(JSON.parse(limpio))
    datos = leido.success ? leido.data.error : undefined
  } catch (error) {
    // Not JSON (a gateway page): the status alone decides, and the raw text is the explanation.
    if (!(error instanceof SyntaxError)) throw error
  }
  const detalle = (datos?.message ?? limpio).slice(0, LARGO_MAXIMO) || "sin detalle"
  const codigo = datos?.code
  const mensaje = `Instagram respondió HTTP ${estado}${codigo === undefined ? "" : ` (código ${codigo})`}: ${detalle}`
  if (codigo === CODIGO_TOKEN) return new TokenVencido(mensaje)
  if (codigo !== undefined && (codigo === CODIGO_PERMISO || (codigo >= 200 && codigo <= 299))) {
    return new FallaDeConfiguracion(mensaje)
  }
  if (codigo !== undefined && CODIGOS_TEMPORALES.includes(codigo)) return new Error(mensaje)
  // Any other answer with a 4xx will not change by asking again; a 5xx, 408 or 429 might.
  const definitivo = estado >= 400 && estado < 500 && estado !== 408 && estado !== 429
  return definitivo ? new FallaDeConfiguracion(mensaje) : new Error(mensaje)
}

async function pedir(url: string, init: RequestInit, esperaMs: number, token: string): Promise<unknown> {
  let respuesta: Response
  try {
    respuesta = await fetch(url, { ...init, signal: AbortSignal.timeout(esperaMs) })
  } catch (error) {
    // Deliberately without the URL (a GET carries the token in it). A plain error: the caller treats it as "unknown".
    throw new Error("No pude conectar con Instagram.", { cause: error })
  }
  if (!respuesta.ok) {
    throw clasificar(respuesta.status, await respuesta.text(), token)
  }
  try {
    return await respuesta.json()
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("Instagram devolvió una respuesta ilegible.", { cause: error })
    throw error
  }
}

function leer<T>(esquema: z.ZodType<T>, cuerpo: unknown, ruta: string): T {
  const resultado = esquema.safeParse(cuerpo)
  if (!resultado.success) {
    throw new Error(`Instagram devolvió una respuesta inesperada en ${ruta}.`)
  }
  return resultado.data
}

async function escribir(ruta: string, cuerpo: Record<string, unknown>, token: string): Promise<unknown> {
  // `access_token` is a documented parameter of the POST; it travels in the body, never in the URL.
  return pedir(
    `${BASE}/${VERSION}${ruta}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...cuerpo, access_token: token }),
    },
    ESPERA_ESCRIBIR_MS,
    token,
  )
}

async function consultar(ruta: string, parametros: Record<string, string>, token: string, versionada = true) {
  const consulta = new URLSearchParams({ ...parametros, access_token: token })
  const base = versionada ? `${BASE}/${VERSION}` : BASE
  return pedir(`${base}${ruta}?${consulta.toString()}`, { method: "GET" }, ESPERA_LEER_MS, token)
}

const RespuestaConId = z.object({ id: z.string().min(1) })

/**
 * Creates the Reels container. Instagram fetches `videoUrl` itself, so it must be reachable when this is called.
 * https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/content-publishing :
 * `POST /<IG_ID>/media` with `media_type=REELS`, `video_url`, `caption` and `is_ai_generated` (boolean, "provide a
 * self-disclosure of AI usage in the media"); answers `{ "id": "<IG_CONTAINER_ID>" }`. The label is set only for
 * avatar videos (design R1).
 */
export async function crearContenedorReel(entrada: {
  token: string
  cuentaId: string
  videoUrl: string
  texto: string
  esAvatar: boolean
}): Promise<string> {
  const { token, cuentaId, videoUrl, texto, esAvatar } = entrada
  const cuerpo = await escribir(
    `/${encodeURIComponent(cuentaId)}/media`,
    {
      media_type: "REELS",
      video_url: videoUrl,
      caption: texto,
      ...(esAvatar ? { is_ai_generated: true } : {}),
    },
    token,
  )
  return leer(RespuestaConId, cuerpo, "/media").id
}

const RespuestaContenedor = z.object({ status_code: z.string(), status: z.string().nullish() })

/**
 * Container status. `GET /<IG_CONTAINER_ID>?fields=status_code` answers EXPIRED, ERROR, FINISHED, IN_PROGRESS or
 * PUBLISHED (content-publishing page above); the container node also has `status`, "an error subcode" when
 * `status_code` is ERROR (https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-container).
 */
export async function estadoContenedor(entrada: { token: string; contenedorId: string }): Promise<EstadoDeContenedor> {
  const { token, contenedorId } = entrada
  const cuerpo = await consultar(`/${encodeURIComponent(contenedorId)}`, { fields: "status_code,status" }, token)
  const contenedor = leer(RespuestaContenedor, cuerpo, "/{contenedor}")
  switch (contenedor.status_code) {
    case "IN_PROGRESS":
      return { estado: "en_proceso" }
    case "FINISHED":
      return { estado: "listo" }
    case "PUBLISHED":
      return { estado: "publicado" }
    case "ERROR":
      return { estado: "error", detalle: contenedor.status || "sin detalle" }
    case "EXPIRED":
      return { estado: "expirado", detalle: contenedor.status || "El contenedor venció sin publicarse." }
    default:
      // A status the docs do not list: a plain error, so the retry reads it again instead of guessing.
      throw new Error(`Instagram devolvió un estado desconocido para el contenedor: ${contenedor.status_code}`)
  }
}

/**
 * Publishes a finished container and returns the media id. `POST /<IG_ID>/media_publish` with `creation_id`,
 * answers `{ "id": "<IG_MEDIA_ID>" }` (content-publishing page above). The docs do not say that repeating it is
 * safe, so the caller never repeats it without reading the container status first.
 */
export async function publicarContenedor(entrada: {
  token: string
  cuentaId: string
  contenedorId: string
}): Promise<string> {
  const { token, cuentaId, contenedorId } = entrada
  const cuerpo = await escribir(`/${encodeURIComponent(cuentaId)}/media_publish`, { creation_id: contenedorId }, token)
  return leer(RespuestaConId, cuerpo, "/media_publish").id
}

const RespuestaMedia = z.object({
  id: z.string().min(1),
  caption: z.string().nullish(),
  permalink: z.string().nullish(),
  media_product_type: z.string().nullish(),
  is_ai_generated: z.boolean().nullish(),
})

/**
 * Reads a published media back. `GET /<IG_MEDIA_ID>?fields=...` with `instagram_business_basic`
 * (https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-media): `caption`,
 * `permalink`, `media_product_type` (REELS for a reel; `media_type` says VIDEO) and `is_ai_generated`, "Indicates
 * if the media has an AI label".
 */
export async function leerPublicacion(entrada: { token: string; mediaId: string }): Promise<Publicacion> {
  const { token, mediaId } = entrada
  const cuerpo = await consultar(
    `/${encodeURIComponent(mediaId)}`,
    { fields: "id,caption,permalink,media_product_type,is_ai_generated" },
    token,
  )
  const media = leer(RespuestaMedia, cuerpo, "/{media}")
  return {
    mediaId: media.id,
    texto: media.caption ?? null,
    permalink: media.permalink ?? null,
    tipoDeProducto: media.media_product_type ?? null,
    etiquetaIa: media.is_ai_generated ?? null,
  }
}

const RespuestaRenovacion = z.object({ access_token: z.string().min(1), expires_in: z.number().positive() })

/**
 * Renews a long-lived token for another 60 days. `GET https://graph.instagram.com/refresh_access_token` with
 * `grant_type=ig_refresh_token` and `access_token`; the token must be at least 24 hours old, still valid and have
 * `instagram_business_basic`
 * (https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login).
 * Answers `{ access_token, token_type, expires_in }`.
 */
export async function renovarToken(entrada: { token: string }): Promise<{ token: string; expiraEnSegundos: number }> {
  const { token } = entrada
  const cuerpo = await consultar("/refresh_access_token", { grant_type: "ig_refresh_token" }, token, false)
  const renovado = leer(RespuestaRenovacion, cuerpo, "/refresh_access_token")
  return { token: renovado.access_token, expiraEnSegundos: renovado.expires_in }
}
