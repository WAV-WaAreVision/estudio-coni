// Ported from Ingesta's lib/ingesta/modelo.ts (leerEntrada, change 29b). The server runs these rules again.
import { z } from "zod"
import { ETIQUETA_DE_TIPO, ROLES, type Rol, TIPOS_DE_MATERIAL, type TipoDeMaterial } from "./modelo"
import { esPodcast, esYoutube } from "./youtube"

export const TAMANO_MAXIMO_BYTES = 2 * 1024 ** 3
export const MAXIMO_DE_IMAGENES = 20
const MAXIMO_DE_TEXTO_PEGADO = 200_000

export const ERROR_SOLICITUD = "No entendí esa solicitud. Vuelve a abrir la pantalla."
const TAMANO_MAXIMO = "2 GB"
export const PESA_DEMASIADO = `Ese archivo pesa más de ${TAMANO_MAXIMO}.`
export const FALTA_EL_ARCHIVO = "No encontré el archivo que subiste. Inténtalo de nuevo."
export const GUARDADO_SIN_INICIAR =
  "El material quedó guardado, pero no pude iniciar su procesamiento. Toca Reintentar en un rato."
export const DEMASIADAS_IMAGENES = `Puedes subir hasta ${MAXIMO_DE_IMAGENES} imágenes.`

type TipoConArchivo = "documento" | "audio" | "video" | "imagen"

/** What each type accepts as a file; `claveMaterial` signs only these (EXTENSIONES_DE_MATERIAL). */
export const EXTENSIONES_POR_TIPO: Record<TipoConArchivo, readonly string[]> = {
  documento: ["pdf", "docx", "txt"],
  audio: ["mp3", "m4a", "wav"],
  video: ["mp4", "mov"],
  imagen: ["jpg", "jpeg", "png", "webp", "heic"],
}

const AYUDA_POR_TIPO: Record<TipoConArchivo, string> = {
  documento: "Ese archivo no sirve como documento. Sube un PDF, un Word o un texto.",
  audio: "Ese archivo no sirve como audio. Sube un mp3, m4a o wav.",
  video: "Ese archivo no sirve como video. Sube un mp4 o mov.",
  imagen: "Ese archivo no sirve como imagen. Sube jpg, png, webp o heic.",
}

const extensionesConPunto = (extensiones: readonly string[]) => extensiones.map((ext) => `.${ext}`).join(",")

/** What the main picker offers; the server checks the extension again. */
export const ACEPTA_TODO = extensionesConPunto(Object.values(EXTENSIONES_POR_TIPO).flat())
/** A post's optional video. */
export const ACEPTA_VIDEO = extensionesConPunto(EXTENSIONES_POR_TIPO.video)

const TIPOS_DE_CONTENIDO: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  mp4: "video/mp4",
  mov: "video/quicktime",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
}

/** The media type the browser must send; it comes from the extension, never from what the browser claims. */
export function tipoDeContenido(extension: string): string {
  return TIPOS_DE_CONTENIDO[extension.toLowerCase()] ?? "application/octet-stream"
}

export function extensionDe(nombre: string): string {
  const punto = nombre.lastIndexOf(".")
  return punto === -1 ? "" : nombre.slice(punto + 1).toLowerCase()
}

/** One presigned PUT: the browser sends the file in `orden` with exactly this content type. */
export interface SubidaFirmada {
  orden: number
  url: string
  tipoContenido: string
}

const direccionWeb = z.string().refine((texto) => {
  try {
    const { protocol } = new URL(texto)
    return protocol === "http:" || protocol === "https:"
  } catch {
    // Not an address at all: the refinement answers with its own message.
    return false
  }
}, "Ese link no parece una dirección web válida.")

const textoOpcional = (maximo: number) =>
  z
    .string()
    .max(maximo, "Ese texto es demasiado largo.")
    .optional()
    .transform((texto) => (texto?.trim() ? texto.trim() : null))

const archivoDeclarado = z.object({
  nombre: z.string().min(1).max(255),
  tamano: z.number().int().min(1, "Ese archivo está vacío.").max(TAMANO_MAXIMO_BYTES, PESA_DEMASIADO),
})

const esquemaBase = z.object({
  tipo: z.enum(TIPOS_DE_MATERIAL, "Elige qué tipo de material es."),
  titulo: textoOpcional(200),
  autorId: z.uuid("Elige el autor."),
  rol: z.enum(ROLES, "Elige quién es para ti."),
  declaracion: z.literal(true, "Marca que el material no contiene datos de pacientes."),
  url: z.string().optional(),
  textoPegado: z.string().max(MAXIMO_DE_TEXTO_PEGADO, "Ese texto es demasiado largo.").optional(),
  referencia: z.string().optional(),
  archivos: z.array(archivoDeclarado),
})

function exigirArchivos(
  entrada: z.infer<typeof esquemaBase>,
  contexto: z.RefinementCtx,
  tipo: TipoConArchivo,
  cantidad: { minimo: number; maximo: number },
) {
  const { archivos } = entrada
  if (archivos.length < cantidad.minimo) {
    contexto.addIssue({ code: "custom", path: ["archivos"], message: "Falta el archivo." })
    return
  }
  if (archivos.length > cantidad.maximo) {
    const mensaje = cantidad.maximo === 1 ? "Sube un solo archivo." : DEMASIADAS_IMAGENES
    contexto.addIssue({ code: "custom", path: ["archivos"], message: mensaje })
    return
  }
  for (const archivo of archivos) {
    if (!EXTENSIONES_POR_TIPO[tipo].includes(extensionDe(archivo.nombre))) {
      contexto.addIssue({ code: "custom", path: ["archivos"], message: AYUDA_POR_TIPO[tipo] })
      return
    }
  }
}

const esquemaDeCreacion = esquemaBase.superRefine((entrada, contexto) => {
  switch (entrada.tipo) {
    case "documento":
    case "audio":
    case "video":
      exigirArchivos(entrada, contexto, entrada.tipo, { minimo: 1, maximo: 1 })
      break
    case "imagen":
      exigirArchivos(entrada, contexto, "imagen", { minimo: 1, maximo: MAXIMO_DE_IMAGENES })
      break
    case "link":
      if (!entrada.url?.trim()) contexto.addIssue({ code: "custom", path: ["url"], message: "Falta el link." })
      else if (!direccionWeb.safeParse(entrada.url.trim()).success) {
        contexto.addIssue({ code: "custom", path: ["url"], message: "Ese link no parece una dirección web válida." })
      } else if (esYoutube(entrada.url) && !entrada.textoPegado?.trim()) {
        contexto.addIssue({ code: "custom", path: ["textoPegado"], message: "Pega la transcripción del video." })
      }
      if (entrada.archivos.length > 0) {
        contexto.addIssue({ code: "custom", path: ["archivos"], message: "Un link no lleva archivos." })
      }
      break
    case "post":
      if (!entrada.textoPegado?.trim()) {
        contexto.addIssue({ code: "custom", path: ["textoPegado"], message: "Falta el texto del post." })
      }
      exigirArchivos(entrada, contexto, "video", { minimo: 0, maximo: 1 })
      break
  }
  const referencia = entrada.referencia?.trim()
  if (
    (entrada.tipo === "video" || entrada.tipo === "imagen") &&
    referencia &&
    !direccionWeb.safeParse(referencia).success
  ) {
    contexto.addIssue({ code: "custom", path: ["referencia"], message: "Ese link no parece una dirección web válida." })
  }
})

export interface DatosDeCreacion {
  tipo: TipoDeMaterial
  titulo: string | null
  autorId: string
  rol: Rol
  url: string | null
  textoPegado: string | null
  /** A reference only for videos and images: it is stored and never fetched. */
  referencia: string | null
  archivos: { nombre: string; tamano: number }[]
}

export type EntradaLeida = { ok: true; datos: DatosDeCreacion } | { ok: false; error: string }

/** Pasted text is kept for a post and for the transcript of a YouTube link; any other link is opened by the task. */
function textoQueSeGuarda(datos: { tipo: TipoDeMaterial; url?: string; textoPegado?: string }): string | null {
  const guardaTexto = datos.tipo === "post" || (datos.tipo === "link" && esYoutube(datos.url ?? ""))
  return guardaTexto ? (datos.textoPegado?.trim() ?? null) : null
}

/** Validates what the browser sent; the error is the first problem, written for Coni. */
export function leerEntrada(entrada: unknown): EntradaLeida {
  // A problem nobody wrote a message for (a number where text goes) is a request this screen never sends.
  const resultado = esquemaDeCreacion.safeParse(entrada, { error: () => ERROR_SOLICITUD })
  if (!resultado.success) return { ok: false, error: resultado.error.issues[0]?.message ?? ERROR_SOLICITUD }
  const { declaracion: _declaracion, ...datos } = resultado.data
  const conReferencia = datos.tipo === "video" || datos.tipo === "imagen"
  return {
    ok: true,
    datos: {
      ...datos,
      url: datos.tipo === "link" ? (datos.url?.trim() ?? null) : null,
      textoPegado: textoQueSeGuarda(datos),
      referencia: conReferencia ? datos.referencia?.trim() || null : null,
    },
  }
}

export const AYUDA_DEL_CAMPO = `Sirve un PDF, Word o texto; un audio mp3, m4a o wav; un video mp4 o mov; o hasta ${MAXIMO_DE_IMAGENES} imágenes. Hasta ${TAMANO_MAXIMO}.`
export const NO_RECONOZCO = `No reconozco ese archivo. ${AYUDA_DEL_CAMPO}`
export const FALTA_LA_ENTRADA = "Pega un enlace o elige un archivo."

/** What the field understood: the material's type and how it is said to her ("Video de YouTube"). */
export interface Deteccion {
  tipo: TipoDeMaterial
  etiqueta: string
}

function tipoDeArchivo(nombre: string): TipoConArchivo | null {
  const extension = extensionDe(nombre)
  const tipos = Object.keys(EXTENSIONES_POR_TIPO) as TipoConArchivo[]
  return tipos.find((tipo) => EXTENSIONES_POR_TIPO[tipo].includes(extension)) ?? null
}

const esWeb = (texto: string): boolean => {
  try {
    const { protocol } = new URL(texto)
    return protocol === "http:" || protocol === "https:"
  } catch {
    // Not an address: it is text.
    return false
  }
}

/** A host with a dot and a letters-only ending ("youtu.be", "www.ejemplo.cl"), then an optional port and path. */
const DOMINIO_SIN_ESQUEMA = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?::\d+)?(?:[/?#]\S*)?$/i

/**
 * The address a whole pasted link points to, with "https://" added when she left it out ("youtu.be/abc").
 * Anything around it makes it text she wrote: "mira https://..." is a post, not a link.
 */
export function normalizarEnlace(texto: string): string | null {
  const limpio = texto.trim()
  if (limpio === "" || /\s/.test(limpio)) return null
  if (esWeb(limpio)) return limpio
  return DOMINIO_SIN_ESQUEMA.test(limpio) && esWeb(`https://${limpio}`) ? `https://${limpio}` : null
}

/** The type of what she pasted or picked (spec table, 4k); the files decide when there are files. */
export function detectarTipo(entrada: { texto: string; archivos: readonly { name: string }[] }): Deteccion | null {
  const { archivos } = entrada
  if (archivos.length > 0) {
    const tipos = archivos.map((archivo) => tipoDeArchivo(archivo.name))
    if (tipos.every((tipo) => tipo === "imagen")) {
      return { tipo: "imagen", etiqueta: archivos.length === 1 ? "Imagen" : `${archivos.length} imágenes` }
    }
    const [unico] = tipos
    return tipos.length === 1 && unico ? { tipo: unico, etiqueta: ETIQUETA_DE_TIPO[unico] } : null
  }
  if (entrada.texto.trim() === "") return null
  const enlace = normalizarEnlace(entrada.texto)
  if (enlace === null) return { tipo: "post", etiqueta: "Texto" }
  if (esYoutube(enlace)) return { tipo: "link", etiqueta: "Video de YouTube" }
  if (esPodcast(enlace)) return { tipo: "link", etiqueta: "Podcast" }
  return { tipo: "link", etiqueta: "Enlace" }
}

/** Her choice wins over the detection until the input changes (the form clears `manual` then). */
export function tipoEfectivo(deteccion: Deteccion | null, manual: TipoDeMaterial | null): Deteccion | null {
  return manual ? { tipo: manual, etiqueta: ETIQUETA_DE_TIPO[manual] } : deteccion
}
