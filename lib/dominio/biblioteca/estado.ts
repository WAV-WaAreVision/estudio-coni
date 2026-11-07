// Ported from Ingesta's app/(app)/estado-de-material.ts, with fix 4j: a word and an icon, never only a colour.

import { dolares } from "@/lib/formato"
import { AVISO_TRAS_SUBIR } from "./borrador-de-subida"

export interface EstadoDeProceso {
  estado: string
  motivo_fallo: string | null
  costo_estimado_usd: number | null
}

/**
 * Marked with a reason, as the database decides: `reintentar_material` accepts any non-null reason and
 * `marcar_disparo_fallido` only marks a null one, so a blank reason counts too. Shared by the state and the detail for WAV.
 */
export function marcadoConMotivo(motivo: string | null): motivo is string {
  return motivo !== null
}

/** A material that failed, or one stopped with a reason (the monthly limit, a run that could not start): retryable. */
export function sePuedeReintentar(material: EstadoDeProceso): boolean {
  return material.estado === "fallido" || (material.estado === "procesando" && marcadoConMotivo(material.motivo_fallo))
}

/** Really working on it: the list keeps asking while any material is. A paused one does not. */
export function estaProcesando(material: EstadoDeProceso): boolean {
  return material.estado === "procesando" && !marcadoConMotivo(material.motivo_fallo)
}

/** While a material is really working, the list and its page ask the server again this often. */
export const REFRESCO_DE_LA_BIBLIOTECA_MS = 10_000

/** What she reads while it works (spec decision 3): the estimate once the task wrote it; null when it is not working. */
export function avisoDeProceso(material: EstadoDeProceso): string | null {
  if (!estaProcesando(material)) return null
  if (material.costo_estimado_usd === null) return AVISO_TRAS_SUBIR
  // A non-breaking space keeps "US$ 1,20" on one line on the phone; only here, `dolares` stays as other screens use it.
  return `${AVISO_TRAS_SUBIR} Costará cerca de ${dolares(material.costo_estimado_usd).replace(" ", "\u00a0")}.`
}

/** The icons the pill draws itself (check, warning circle) are `null` here; these two it is given. */
export type IconoDeEstado = "reloj" | "pausa" | null

export interface EstadoVisible {
  palabra: string
  tipo: "ok" | "aviso" | "error" | "neutro"
  icono: IconoDeEstado
}

export function presentarEstado(material: EstadoDeProceso): EstadoVisible {
  if (material.estado === "listo") return { palabra: "Listo", tipo: "ok", icono: null }
  if (material.estado === "fallido") return { palabra: "Con error", tipo: "error", icono: null }
  if (material.estado === "procesando" && marcadoConMotivo(material.motivo_fallo)) {
    return { palabra: "En pausa", tipo: "aviso", icono: "pausa" }
  }
  if (material.estado === "procesando") return { palabra: "Procesando", tipo: "neutro", icono: "reloj" }
  return { palabra: material.estado, tipo: "neutro", icono: null }
}
