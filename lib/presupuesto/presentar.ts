/** The most the cap goes in Ajustes › Presupuesto. */
export const MAXIMO_DEL_TOPE_USD = 500
/** Twice the largest cap: the default limit of the largest cap still fits. */
export const MAXIMO_DEL_LIMITE_USD = 2 * MAXIMO_DEL_TOPE_USD
/** Both steppers move in steps of US$ 5. */
export const PASO_DEL_PRESUPUESTO_USD = 5

/** D5: the limit is twice the cap unless Coni sets her own. */
export function limitePorDefecto(tope: number): number {
  return 2 * tope
}
