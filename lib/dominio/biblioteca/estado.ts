// Ported from Ingesta's app/(app)/estado-de-material.ts, with fix 4j: a word and an icon, never only a colour.

export interface EstadoDeProceso {
  estado: string
  motivo_fallo: string | null
  costo_estimado_usd: number | null
  costo_confirmado_en: string | null
}

/**
 * Marked with a reason, as the database decides: `reintentar_material` accepts any non-null reason and
 * `marcar_disparo_fallido` only marks a null one, so a blank reason counts too. Shared by the state and the detail for WAV.
 */
export function marcadoConMotivo(motivo: string | null): motivo is string {
  return motivo !== null
}

/** A long material the task stopped before spending: it waits for her to confirm what it will cost. */
export function esperaConfirmacion(material: EstadoDeProceso): boolean {
  return (
    material.estado === "procesando" && material.costo_estimado_usd !== null && material.costo_confirmado_en === null
  )
}

/** A material that failed, or one stopped with a reason (the monthly cap, a run that could not start): retryable. */
export function sePuedeReintentar(material: EstadoDeProceso): boolean {
  if (esperaConfirmacion(material)) return false
  return material.estado === "fallido" || (material.estado === "procesando" && marcadoConMotivo(material.motivo_fallo))
}

/** Really working on it: the list keeps asking while any material is. A paused or waiting one does not. */
export function estaProcesando(material: EstadoDeProceso): boolean {
  return material.estado === "procesando" && !marcadoConMotivo(material.motivo_fallo)
}

/** The icons the pill draws itself (check, warning circle) are `null` here; these three it is given. */
export type IconoDeEstado = "reloj" | "pausa" | "mano" | null

export interface EstadoVisible {
  palabra: string
  tipo: "ok" | "aviso" | "error" | "neutro"
  icono: IconoDeEstado
}

export function presentarEstado(material: EstadoDeProceso): EstadoVisible {
  if (esperaConfirmacion(material)) return { palabra: "Espera tu OK", tipo: "aviso", icono: "mano" }
  if (material.estado === "listo") return { palabra: "Listo", tipo: "ok", icono: null }
  if (material.estado === "fallido") return { palabra: "Con error", tipo: "error", icono: null }
  if (material.estado === "procesando" && marcadoConMotivo(material.motivo_fallo)) {
    return { palabra: "En pausa", tipo: "aviso", icono: "pausa" }
  }
  if (material.estado === "procesando") return { palabra: "Procesando", tipo: "neutro", icono: "reloj" }
  return { palabra: material.estado, tipo: "neutro", icono: null }
}
