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
