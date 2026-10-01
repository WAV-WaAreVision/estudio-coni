import { conciliarRenders, type DepsConciliacion } from "./conciliar"
import { barrerGastos } from "./gastos"
import { type DepsRespaldo, respaldarBase } from "./respaldo"
import { aplicarRetencion, type DepsRetencion } from "./retencion"
import { type DepsTokenMeta, mantenerTokenMeta } from "./token-meta"

type Trabajos = Record<string, () => Promise<unknown>>

/**
 * Runs independent jobs one after the other. A job that fails does not stop the rest: the failures are raised together
 * at the end, so the run is marked as failed and WAV is told (`onFailure`), but tonight's backup still happens when
 * the token renewal broke.
 */
export async function enSerie<T extends Trabajos>(trabajos: T): Promise<{ [K in keyof T]: Awaited<ReturnType<T[K]>> }> {
  const resultados: Record<string, unknown> = {}
  const errores: Error[] = []
  for (const [nombre, trabajo] of Object.entries(trabajos)) {
    try {
      resultados[nombre] = await trabajo()
    } catch (error) {
      if (!(error instanceof Error)) throw error
      errores.push(new Error(`${nombre}: ${error.message}`, { cause: error }))
    }
  }
  if (errores.length > 0) {
    throw new AggregateError(errores, `Falló el mantenimiento: ${errores.map((e) => e.message).join(" | ")}`)
  }
  return resultados as { [K in keyof T]: Awaited<ReturnType<T[K]>> }
}

export type DepsFrecuente = DepsConciliacion
export type DepsNocturno = DepsRetencion & DepsTokenMeta & DepsRespaldo

/** Every ten minutes: renders that lost their callback and reservations that outlived their run. */
export function mantenimientoFrecuente(deps: DepsFrecuente) {
  return enSerie({
    renders: () => conciliarRenders(deps),
    gastos: () => barrerGastos(deps),
  })
}

/** At 03:00 America/Santiago: file retention, Instagram's token and the backup of the database. */
export function mantenimientoNocturno(deps: DepsNocturno) {
  return enSerie({
    retencion: () => aplicarRetencion(deps),
    token: () => mantenerTokenMeta(deps),
    respaldo: () => respaldarBase(deps),
  })
}
