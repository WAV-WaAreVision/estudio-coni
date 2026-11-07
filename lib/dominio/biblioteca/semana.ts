import { dolares } from "@/lib/formato"

// Semana, the latest run of the weekly engine (spec 2026-11-06, batch 5). Ported from Ingesta's lib/ingesta/semana.ts.

export const RUTA_DE_SEMANA = "/biblioteca/semana"

/** What «Proponer ahora» is said to cost before any run cost something (spec decision 5). */
export const COSTO_SIN_HISTORIA_USD = 0.3
const CORRIDAS_PARA_ESTIMAR = 4

/** The median of the latest runs that cost something, to the cent (4a). `costos` comes newest first. */
export function estimarCostoDelMotor(costos: readonly number[]): number {
  const conCosto = costos
    .filter((costo) => costo > 0)
    .slice(0, CORRIDAS_PARA_ESTIMAR)
    .toSorted((a, b) => a - b)
  if (conCosto.length === 0) return COSTO_SIN_HISTORIA_USD
  const mitad = Math.floor(conCosto.length / 2)
  const mediana =
    conCosto.length % 2 === 1 ? (conCosto[mitad] ?? 0) : ((conCosto[mitad - 1] ?? 0) + (conCosto[mitad] ?? 0)) / 2
  return Math.round(mediana * 100) / 100
}

export function textoDeCosto(usd: number): string {
  return `Cuesta cerca de ${dolares(usd)}`
}
