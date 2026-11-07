import { URL_DE_LA_APP } from "@/lib/diseno/marca"
import { leerFicha } from "@/lib/dominio/biblioteca/ficha"
import { esTextoDePausa } from "@/lib/dominio/pausas"

// «Avisar a Federico» (spec 2026-11-07, decision 6 and amendment A11). Client components import the copy from here,
// so this module stays free of Node APIs (the key is hashed with Web Crypto).

export const ETIQUETA_AVISAR = "Avisar a Federico"
export const TEXTO_LE_AVISE = "Le avisé a Federico."
export const TEXTO_YA_NO_FALLA = "Esto ya no está fallando. Vuelve a abrir la pantalla."
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
  if (explicacion === null || esTextoDePausa(explicacion)) return null
  if (VIDEO_EN_CURSO.includes(entidad.estado)) return explicacion
  // Gate 1 offers Federico only for a key ElevenLabs refused; a HeyGen failure there asks her to sign again.
  if (entidad.estado === GATE_1 && esFallaDeLlave(explicacion) && !/\bHeyGen\b/i.test(explicacion)) return explicacion
  return null
}

/** One email per failure: the entity, its id and the first 16 hex of the explanation's sha256. */
export async function claveDeAviso(entrada: { tipo: TipoDeAviso; id: string; explicacion: string }): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(entrada.explicacion))
  const primeros = Array.from(new Uint8Array(digest).subarray(0, 8))
  const huella = primeros.map((byte) => byte.toString(16).padStart(2, "0")).join("")
  return `${entrada.tipo}:${entrada.id}:${huella}`
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
