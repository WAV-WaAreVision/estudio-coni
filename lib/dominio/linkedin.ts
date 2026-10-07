import type { EstadoDePublicacion } from "@/lib/dominio/destinos"
import { AVISO_AVATAR, AVISO_AVATAR_LINKEDIN } from "@/lib/dominio/revision"

const HASHTAG = /(^|\s)#[\p{L}\p{N}_]+/gu

/**
 * Where the text of a piece from before LinkedIn starts: its Instagram caption without the hashtags and with the
 * LinkedIn avatar notice in place of the Instagram one. Deterministic and free (no Claude call): Coni reads it, edits it
 * and saves it, and the review runs on what she saves.
 */
export function textoDeLinkedinDesdeInstagram(caption: string): string {
  const lineas = caption
    .split("\n")
    .map((linea) => ({ linea, sinHashtags: linea.replace(HASHTAG, "$1").replace(/ {2,}/g, " ").trimEnd() }))
    // A line that held only hashtags goes with them; a blank line between paragraphs stays.
    .filter(({ linea, sinHashtags }) => sinHashtags !== "" || linea.trim() === "")
    .map(({ sinHashtags }) => sinHashtags)
  return lineas
    .join("\n")
    .replace(AVISO_AVATAR, AVISO_AVATAR_LINKEDIN)
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/** "little" text (F8): every reserved character is escaped with a backslash, even outside an element. */
const RESERVADOS = /[|{}@[\]()<>#\\*_~]/g
/** A hashtag starts a word: `#` right after the start or a blank, followed by letters, digits or `_`. */
const ETIQUETA = /(^|\s)#([\p{L}\p{N}_]+)/gu

function escapar(texto: string): string {
  return texto.replace(RESERVADOS, (caracter) => `\\${caracter}`)
}

/** The approved text as LinkedIn's `commentary`: shown exactly as approved, with its hashtags still hashtags. */
export function aLittleText(texto: string): string {
  let salida = ""
  let desde = 0
  for (const encontrado of texto.matchAll(ETIQUETA)) {
    const inicio = (encontrado.index ?? 0) + (encontrado[1]?.length ?? 0)
    const etiqueta = encontrado[2] ?? ""
    salida += `${escapar(texto.slice(desde, inicio))}{hashtag|\\#|${escapar(etiqueta)}}`
    desde = inicio + 1 + etiqueta.length
  }
  return salida + escapar(texto.slice(desde))
}

const URN_DE_POST = /^urn:li:(share|ugcPost):[0-9]+$/

export function esUrnDePost(urn: string): boolean {
  return URN_DE_POST.test(urn)
}

/** The feed permalink (F9). */
export function enlaceDePost(urn: string): string {
  if (!esUrnDePost(urn)) throw new Error(`No es un post de LinkedIn: ${urn}`)
  return `https://www.linkedin.com/feed/update/${urn}/`
}

/** Failed tries (temporary errors, failed processing) before the row goes to manual. */
export const MAXIMO_DE_INTENTOS_LINKEDIN = 3

export interface FilaDeLinkedin {
  estado: EstadoDePublicacion
  videoUrn: string | null
  enviadoEn: string | null
  postUrn: string | null
  intentos: number
}

export type PasoLinkedin =
  | { tipo: "nada" }
  | { tipo: "dudosa" }
  | { tipo: "a_mano" }
  | { tipo: "subir_video" }
  | { tipo: "esperar_video" }

/** Where a LinkedIn row is, read from its columns alone (L6, L10). A sent row without a post is never sent again. */
export function siguientePasoLinkedin(fila: FilaDeLinkedin): PasoLinkedin {
  if (fila.estado !== "esperando" || fila.postUrn !== null) return { tipo: "nada" }
  if (fila.enviadoEn !== null) return { tipo: "dudosa" }
  if (fila.intentos >= MAXIMO_DE_INTENTOS_LINKEDIN) return { tipo: "a_mano" }
  if (fila.videoUrn === null) return { tipo: "subir_video" }
  return { tipo: "esperar_video" }
}

const DIA_MS = 86_400_000

/** The thresholds of L4: 14 days, 3 days, expired (0). `dias` rounds up, as Coni reads it. */
export function avisoDeVencimientoLinkedin(
  expiraEn: number,
  ahora: number,
): { umbral: 14 | 3 | 0; dias: number } | null {
  const restante = expiraEn - ahora
  if (restante <= 0) return { umbral: 0, dias: 0 }
  const dias = Math.ceil(restante / DIA_MS)
  if (dias <= 3) return { umbral: 3, dias }
  if (dias <= 14) return { umbral: 14, dias }
  return null
}

/** Each version lives at least one year (F4); WAV is told two months before. */
export function versionDeLinkedinPorVencer(version: string, ahora: string): boolean {
  const partes = /^(\d{4})(0[1-9]|1[0-2])$/.exec(version)
  if (!partes) throw new Error(`Versión de LinkedIn inválida: ${version}`)
  const fecha = new Date(ahora)
  const meses = (fecha.getUTCFullYear() - Number(partes[1])) * 12 + (fecha.getUTCMonth() + 1 - Number(partes[2]))
  return meses >= 10
}

/** Whether Coni's LinkedIn connection is alive at `ahora`: there is a member and the token has not expired. */
export function linkedinConectadoEn(
  ajustes: { linkedin_miembro: string | null; linkedin_token_expira_en: string | null },
  ahora: number,
): boolean {
  return (
    ajustes.linkedin_miembro !== null &&
    ajustes.linkedin_token_expira_en !== null &&
    Date.parse(ajustes.linkedin_token_expira_en) > ahora
  )
}
