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

export const YA_PROPUSO = "El motor ya propuso ideas esta semana. Puedes pedir otras desde el lunes."
export const NO_ARRANCO = "No pude pedirle ideas al motor. Inténtalo de nuevo en unos minutos."
export const MOTOR_PEDIDO = "El motor se puso a trabajar. Las ideas llegan a Ideas en unos minutos."

/** The engine retakes a run stuck in `corriendo` once it is older than this (`MINUTOS_PARA_RETOMAR`, lib/motor/semanal.ts). */
const MINUTOS_DE_UNA_CORRIDA_VIVA = 30
const MS_POR_MINUTO = 60_000

export interface CorridaDeEstaSemana {
  estado: string
  creadaEn: string
}

/**
 * «Proponer ahora» (as Ingesta): never over a ready week or a run still alive; a failed week, or a run older than the
 * engine's retake window, can be asked again, because the engine retakes it. The boundary is the engine's: strictly older.
 */
export function puedePedirMotor(corrida: CorridaDeEstaSemana | null, ahora: Date): boolean {
  if (corrida === null) return true
  if (corrida.estado === "lista") return false
  if (corrida.estado === "corriendo") {
    return (ahora.getTime() - Date.parse(corrida.creadaEn)) / MS_POR_MINUTO > MINUTOS_DE_UNA_CORRIDA_VIVA
  }
  return true
}
