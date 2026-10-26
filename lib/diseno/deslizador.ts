/** Where the thumb counts as "approved" (brandkit 9.12: 96 percent of the travel). */
export const UMBRAL_DE_APROBACION = 96

/** Percent of the free travel the thumb has moved since the finger went down (1 to 1, no curve). */
export function progresoDeArrastre({
  inicioX,
  actualX,
  recorrido,
}: {
  inicioX: number
  actualX: number
  recorrido: number
}): number {
  if (recorrido <= 0) return 0
  return Math.min(100, Math.max(0, ((actualX - inicioX) / recorrido) * 100))
}

export function apruebaAlSoltar(progreso: number): boolean {
  return progreso >= UMBRAL_DE_APROBACION
}

/** Decision 5: one label on both gates, the armed and the sent states, and how to sign without dragging. */
export const ETIQUETA_DE_FIRMA = "Desliza para firmar"
/** The same act at large text, where the whole label would break in two lines next to the thumb (decision 6): a whole verb, never a cut sentence. */
export const ETIQUETA_CORTA_DE_FIRMA = "Firmar"
export const TEXTO_ARMADO = "Toca otra vez para firmar"
export const TEXTO_FIRMADO = "Firmado"
/** What the slider's value reads at rest (v6 `aria-valuetext`). */
export const TEXTO_SIN_FIRMAR = "Sin firmar"
export const PISTA_DE_FIRMA = "Enter o Espacio firman. También puedes tocar dos veces: la primera prepara la firma."

/** A pointer that moved more than this is a drag or a scroll, never a tap. */
export const TOQUE_MAXIMO_PX = 8
/** A second tap sooner than this is an accidental double tap, or VoiceOver's double tap delivered as two events. */
export const ESPERA_MINIMA_MS = 400
/** An armed control waits this long for the second tap, then goes back to rest. */
export const ARMADO_MAXIMO_MS = 4000

export function esToque({ dx, dy }: { dx: number; dy: number }): boolean {
  return Math.hypot(dx, dy) <= TOQUE_MAXIMO_PX
}

export type RespuestaAlToque = "armar" | "firmar" | "ignorar"

/** What a tap (or an arming key) does, given when the control was armed; null means at rest. */
export function respuestaAlToque(armadoEn: number | null, ahora: number): RespuestaAlToque {
  if (armadoEn === null) return "armar"
  const pasado = ahora - armadoEn
  if (pasado < ESPERA_MINIMA_MS) return "ignorar"
  return pasado <= ARMADO_MAXIMO_MS ? "firmar" : "armar"
}
