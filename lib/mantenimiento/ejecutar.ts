import { completarVinculos } from "@/lib/ingesta/completar-vinculos"
import type { DepsProcesar } from "@/lib/ingesta/procesar"
import { type DepsArranques, reanudarArranques } from "./arranques"
import { conciliarRenders, type DepsConciliacion } from "./conciliar"
import { barrerGastos } from "./gastos"
import { type DepsRespaldo, respaldarBase } from "./respaldo"
import { aplicarRetencion, type DepsRetencion } from "./retencion"
import { type DepsTeoriasAtascadas, rescatarTeoriasAtascadas } from "./teorias"
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

/** Materials the vinculos sweep handles on each ten-minute run. */
export const LIMITE_DE_VINCULOS = 20

export type DepsFrecuente = DepsConciliacion &
  DepsArranques &
  DepsTeoriasAtascadas & {
    /** What the sweep of embeddings and links needs; null when it cannot run (no keys), which is not a failure. */
    vinculos: () => Promise<DepsProcesar | null>
  }
export type DepsNocturno = DepsRetencion & DepsTokenMeta & DepsRespaldo

/** Every ten minutes: runs that never started, renders that lost their callback, reservations that outlived their run, theories whose synthesis never finished and the embeddings and links left behind. */
export function mantenimientoFrecuente(deps: DepsFrecuente) {
  return enSerie({
    arranques: () => reanudarArranques(deps),
    renders: () => conciliarRenders(deps),
    gastos: () => barrerGastos(deps),
    teorias: () => rescatarTeoriasAtascadas(deps),
    vinculos: async () => {
      const propias = await deps.vinculos()
      return propias ? completarVinculos(propias, { limite: LIMITE_DE_VINCULOS }) : { procesados: 0, tope: false }
    },
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
