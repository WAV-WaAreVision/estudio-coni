import { z } from "zod"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import { esUrnDePost, tituloDelDocumento } from "@/lib/dominio/linkedin"
import { baseDe } from "./bases"

// Versioned REST APIs for a member (F2, F3, F4):
// https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/videos-api
// https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api
// https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/documents-api (carousels, part 3;
// verified 2026-10-27 for 202609)
// https://learn.microsoft.com/en-us/linkedin/marketing/versioning (each version lives at least one year; there is no
// default, so every call carries one). Bump it with a reviewed commit when the nightly alert says so.
export const VERSION_DE_LINKEDIN = "202609"

const BASE_API = "https://api.linkedin.com"
const ESPERA_MS = 30_000
const ESPERA_PARTE_MS = 120_000

/** 401 (F17): expired or revoked. Coni renews LinkedIn in Ajustes. */
export class TokenDeLinkedinVencido extends FallaDeConfiguracion {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = "TokenDeLinkedinVencido"
  }
}

/** A definitive "no" (4xx other than 401, 408, 429), including 426 for a sunset version. */
export class RechazoDeLinkedin extends FallaDeConfiguracion {
  constructor(
    readonly http: number,
    mensaje: string,
  ) {
    super(mensaje)
    this.name = "RechazoDeLinkedin"
  }
}

/** The post may or may not exist: never send it again (L6.8). */
export class RespuestaDudosa extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = "RespuestaDudosa"
  }
}

function base(): string {
  return baseDe(process.env, "LINKEDIN_API_BASE_URL", BASE_API)
}

function cabeceras(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Linkedin-Version": VERSION_DE_LINKEDIN,
    "X-Restli-Protocol-Version": "2.0.0",
    "Content-Type": "application/json",
  }
}

async function errorDe(respuesta: Response, ruta: string, token: string): Promise<Error> {
  const detalle = (await respuesta.text()).slice(0, 300).split(token).join("[x]")
  const mensaje = `LinkedIn respondió HTTP ${respuesta.status} en ${ruta}: ${detalle}`
  if (respuesta.status === 401) return new TokenDeLinkedinVencido(mensaje)
  if (respuesta.status >= 400 && respuesta.status < 500 && respuesta.status !== 408 && respuesta.status !== 429) {
    return new RechazoDeLinkedin(respuesta.status, mensaje)
  }
  return new Error(mensaje)
}

async function llamar(
  url: string,
  init: RequestInit,
  ruta: string,
  token: string,
  espera = ESPERA_MS,
): Promise<Response> {
  let respuesta: Response
  try {
    respuesta = await fetch(url, { ...init, signal: AbortSignal.timeout(espera) })
  } catch (error) {
    // Deliberately without the URL: an upload URL is a credential.
    throw new Error(`No pude conectar con LinkedIn en ${ruta}.`, { cause: error })
  }
  if (!respuesta.ok) throw await errorDe(respuesta, ruta, token)
  return respuesta
}

const Iniciada = z.object({
  value: z.object({
    video: z.string().startsWith("urn:li:video:"),
    uploadToken: z.string(),
    uploadInstructions: z
      .array(z.object({ uploadUrl: z.string().url(), firstByte: z.number().int(), lastByte: z.number().int() }))
      .min(1),
  }),
})

/** initializeUpload, one PUT per byte range (ETags kept in order), finalizeUpload (F5). Returns the video URN. */
export async function subirVideo(entrada: { token: string; miembro: string; datos: Uint8Array }): Promise<string> {
  const { token, miembro, datos } = entrada
  const inicio = await llamar(
    `${base()}/rest/videos?action=initializeUpload`,
    {
      method: "POST",
      headers: cabeceras(token),
      body: JSON.stringify({
        initializeUploadRequest: {
          owner: miembro,
          fileSizeBytes: datos.byteLength,
          uploadCaptions: false,
          uploadThumbnail: false,
        },
      }),
    },
    "initializeUpload",
    token,
  )
  const leida = Iniciada.safeParse(await inicio.json())
  if (!leida.success) throw new Error("LinkedIn devolvió una respuesta inesperada en initializeUpload.")
  const { video, uploadToken, uploadInstructions } = leida.data.value

  const etags: string[] = []
  for (const parte of uploadInstructions) {
    const respuesta = await llamar(
      parte.uploadUrl,
      {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: datos.slice(parte.firstByte, parte.lastByte + 1),
      },
      "la subida de una parte",
      token,
      ESPERA_PARTE_MS,
    )
    const etag = respuesta.headers.get("etag")
    if (!etag) throw new Error("LinkedIn no devolvió el ETag de una parte del video.")
    etags.push(etag.replace(/^"|"$/g, ""))
  }

  await llamar(
    `${base()}/rest/videos?action=finalizeUpload`,
    {
      method: "POST",
      headers: cabeceras(token),
      body: JSON.stringify({ finalizeUploadRequest: { video, uploadToken, uploadedPartIds: etags } }),
    },
    "finalizeUpload",
    token,
  )
  return video
}

const Video = z.object({ status: z.string(), processingFailureReason: z.string().optional() })

export type EstadoDeVideo = { estado: "listo" } | { estado: "procesando" } | { estado: "fallido"; detalle: string }

/** F6: post only when AVAILABLE. */
export async function estadoDelVideo(entrada: { token: string; video: string }): Promise<EstadoDeVideo> {
  const respuesta = await llamar(
    `${base()}/rest/videos/${encodeURIComponent(entrada.video)}`,
    { method: "GET", headers: cabeceras(entrada.token) },
    "el estado del video",
    entrada.token,
  )
  const leido = Video.safeParse(await respuesta.json())
  if (!leido.success) throw new Error("LinkedIn devolvió una respuesta inesperada al leer el video.")
  switch (leido.data.status) {
    case "AVAILABLE":
      return { estado: "listo" }
    case "PROCESSING_FAILED":
      return { estado: "fallido", detalle: leido.data.processingFailureReason ?? "sin motivo" }
    default:
      return { estado: "procesando" }
  }
}

const DocumentoIniciado = z.object({
  value: z.object({
    uploadUrl: z.string().url(),
    document: z.string().regex(/^urn:li:document:[A-Za-z0-9_-]+$/),
  }),
})

/** A carousel's PDF (part 3): initializeUpload for the member, then one PUT of the whole file. Returns the URN. */
export async function subirDocumento(entrada: { token: string; miembro: string; datos: Uint8Array }): Promise<string> {
  const { token, miembro, datos } = entrada
  const inicio = await llamar(
    `${base()}/rest/documents?action=initializeUpload`,
    {
      method: "POST",
      headers: cabeceras(token),
      body: JSON.stringify({ initializeUploadRequest: { owner: miembro } }),
    },
    "initializeUpload del documento",
    token,
  )
  const leida = DocumentoIniciado.safeParse(await inicio.json())
  if (!leida.success) throw new Error("LinkedIn devolvió una respuesta inesperada en initializeUpload del documento.")
  const { uploadUrl, document } = leida.data.value
  // The documented upload carries the member's token (a video part does not). LinkedIn names no content type.
  await llamar(
    uploadUrl,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream" },
      body: datos.slice(),
    },
    "la subida del documento",
    token,
    ESPERA_PARTE_MS,
  )
  return document
}

const Documento = z.object({ status: z.string() })

/** The docs name no failure reason for a document, so a failure carries none. */
export type EstadoDeDocumento = { estado: "listo" } | { estado: "procesando" } | { estado: "fallido" }

/** Post only when AVAILABLE (as a video, F6). */
export async function estadoDelDocumento(entrada: { token: string; documento: string }): Promise<EstadoDeDocumento> {
  const respuesta = await llamar(
    `${base()}/rest/documents/${encodeURIComponent(entrada.documento)}`,
    { method: "GET", headers: cabeceras(entrada.token) },
    "el estado del documento",
    entrada.token,
  )
  const leido = Documento.safeParse(await respuesta.json())
  if (!leido.success) throw new Error("LinkedIn devolvió una respuesta inesperada al leer el documento.")
  switch (leido.data.status) {
    case "AVAILABLE":
      return { estado: "listo" }
    case "PROCESSING_FAILED":
      return { estado: "fallido" }
    default:
      return { estado: "procesando" }
  }
}

/** One medium per post: a reel's video (no title: it is not part of gate 2) or a carousel's document with its title. */
export type MedioDelPost = { video: string } | { documento: string; titulo: string }

/** F7: the 201 carries the post URN in `x-restli-id`. The Documents API requires `content.media.title`. */
export async function crearPost(
  entrada: { token: string; miembro: string; commentary: string } & MedioDelPost,
): Promise<string> {
  const media =
    "documento" in entrada
      ? { id: entrada.documento, title: tituloDelDocumento(entrada.titulo) }
      : { id: entrada.video }
  const respuesta = await llamar(
    `${base()}/rest/posts`,
    {
      method: "POST",
      headers: cabeceras(entrada.token),
      body: JSON.stringify({
        author: entrada.miembro,
        commentary: entrada.commentary,
        visibility: "PUBLIC",
        distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
        content: { media },
        lifecycleState: "PUBLISHED",
        isReshareDisabledByAuthor: false,
      }),
    },
    "posts",
    entrada.token,
  )
  const urn = respuesta.headers.get("x-restli-id")?.trim() ?? ""
  if (!esUrnDePost(urn)) throw new RespuestaDudosa(`LinkedIn respondió ${respuesta.status} sin un id de post válido.`)
  return urn
}
