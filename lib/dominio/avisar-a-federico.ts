import { URL_DE_LA_APP } from "@/lib/diseno/marca"
import { leerFicha } from "@/lib/dominio/biblioteca/ficha"
import { esTextoDePausa } from "@/lib/dominio/pausas"
import { TEXTO_LIMITE } from "@/lib/presupuesto/texto-limite"

// «Avisar a Federico» (spec 2026-11-07, decision 6 and amendment A11). Client components import the copy from here,
// so this module stays free of Node APIs (the key is hashed with Web Crypto).

export const ETIQUETA_AVISAR = "Avisar a Federico"
export const TEXTO_LE_AVISE = "Le avisé a Federico."
export const TEXTO_YA_NO_FALLA = "Esto ya no está fallando. Vuelve a abrir la pantalla."
export const TEXTO_AVISANDO = "Le estoy avisando. Vuelve a intentarlo en un momento."
export const TEXTO_FICHA_ILEGIBLE = "No pude leer la ficha de este material."

export type TipoDeAviso = "pieza" | "material"

// A key ElevenLabs refused, or none saved: trying again gives the same answer, so the screens never offer it.
const FALLA_DE_LLAVE = /\b(401|403)\b|\bllave\b/i
export const esFallaDeLlave = (texto: string) => FALLA_DE_LLAVE.test(texto)

const GATE_1 = "guion_por_aprobar"
const VIDEO_EN_CURSO: readonly string[] = ["en_render", "subtitulando"]

export type PiezaParaAviso = { tipo: "pieza"; estado: string; explicacion: string | null }
export type MaterialParaAviso = {
  tipo: "material"
  estado: string
  rol: string
  /** The stored `fichas` row as it comes from the database, null when there is none. */
  filaDeFicha: Parameters<typeof leerFicha>[0] | null
}

/**
 * What WAV must hear about, read from the entity itself (never from the screen), or null when it does not fail in a
 * way only WAV can fix: a pause (WAV already knows), no explanation, or a failure she can retry herself.
 */
export function fallaParaFederico(entidad: PiezaParaAviso | MaterialParaAviso): string | null {
  if (entidad.tipo === "material") {
    // Only an estrategia material shows its ficha; a missing row means it was processed with another role, and
    // reprocessing (her own button) fixes that.
    const ilegible = entidad.filaDeFicha !== null && leerFicha(entidad.filaDeFicha) === null
    return entidad.estado === "listo" && entidad.rol === "estrategia" && ilegible ? TEXTO_FICHA_ILEGIBLE : null
  }
  const explicacion = entidad.explicacion?.trim() ? entidad.explicacion : null
  // A pause is WAV's already, and the monthly limit is hers to reactivate in Ajustes.
  if (explicacion === null || esTextoDePausa(explicacion) || explicacion === TEXTO_LIMITE) return null
  if (VIDEO_EN_CURSO.includes(entidad.estado)) return explicacion
  // Gate 1 offers Federico only for a key ElevenLabs refused; a HeyGen failure there asks her to sign again.
  if (entidad.estado === GATE_1 && esFallaDeLlave(explicacion) && !/\bHeyGen\b/i.test(explicacion)) return explicacion
  return null
}

async function huella(texto: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto))
  const primeros = Array.from(new Uint8Array(digest).subarray(0, 8))
  return primeros.map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

/** A piece's occurrence is its attempt: every retry, voice or video, moves `piezas.intento` on. */
export const ocurrenciaDePieza = (intento: number) => `i${intento}`

/**
 * A material's occurrence is a fingerprint of its stored card row. `corrida_id` is cleared when a run ends, a
 * reprocess keeps an estrategia card and `fichas` has no timestamp of its own, so the row itself is what changes when
 * the card is written or edited again.
 */
export async function ocurrenciaDeFicha(fila: NonNullable<MaterialParaAviso["filaDeFicha"]>): Promise<string> {
  return `f${await huella(JSON.stringify([fila.resumen, fila.ideas_clave, fila.citas, fila.fuente]))}`
}

/**
 * One email per failure: the entity, its id, the first 16 hex of the explanation's sha256 and the occurrence, so the
 * same text coming back on a new attempt or run is told again.
 */
export async function claveDeAviso(entrada: {
  tipo: TipoDeAviso
  id: string
  explicacion: string
  ocurrencia: string
}): Promise<string> {
  return `${entrada.tipo}:${entrada.id}:${await huella(entrada.explicacion)}:${entrada.ocurrencia}`
}

export function asuntoDeAviso(titulo: string): string {
  return `Coni te avisa: «${titulo}»`
}

const CLASE: Record<TipoDeAviso, string> = { pieza: "Pieza", material: "Material" }
const RUTA: Record<TipoDeAviso, string> = { pieza: "/guion/", material: "/biblioteca/materiales/" }

export function cuerpoDeAviso(aviso: { tipo: TipoDeAviso; id: string; titulo: string; explicacion: string }): string {
  return [
    `${CLASE[aviso.tipo]}: «${aviso.titulo}»`,
    `Qué pasó: ${aviso.explicacion}`,
    `Ábrelo en ${URL_DE_LA_APP}${RUTA[aviso.tipo]}${aviso.id}`,
    "Coni tocó «Avisar a Federico» en esa pantalla.",
  ].join("\n")
}

/** A balance block at gate 1 that WAV hears about from her tap: no pause opens for it (issue 101, decision 1). */
export type MotivoDeSaldo = "saldo_voz" | "saldo_video"

const PROVEEDOR_DEL_SALDO: Record<MotivoDeSaldo, string> = { saldo_voz: "ElevenLabs", saldo_video: "HeyGen" }

/** One email per piece attempt and motivo: a new attempt that hits the balance again is told again. */
export function claveDeAvisoDeSaldo(entrada: { id: string; motivo: MotivoDeSaldo; intento: number }): string {
  return `pieza:${entrada.id}:${entrada.motivo}:${ocurrenciaDePieza(entrada.intento)}`
}

export function cuerpoDeAvisoDeSaldo(aviso: {
  id: string
  titulo: string
  motivo: MotivoDeSaldo
  /** The block's own text, with what is left and what this costs. */
  bloqueo: string
  estimado: string
  /** The balance line WAV already sees on the screen. */
  saldo: string
}): string {
  return [
    `Pieza: «${aviso.titulo}»`,
    `Proveedor: ${PROVEEDOR_DEL_SALDO[aviso.motivo]}`,
    `Qué pasó: ${aviso.bloqueo}`,
    `Estimado: ${aviso.estimado}`,
    `Saldo: ${aviso.saldo}`,
    `Ábrelo en ${URL_DE_LA_APP}${RUTA.pieza}${aviso.id}`,
    "Coni tocó «Avisar a Federico» en esa pantalla.",
  ].join("\n")
}
