import { fusionarTemas } from "@/lib/ingesta/temas"
import { type DepsArranques, reanudarArranques } from "./arranques"
import { conciliarRenders, type DepsConciliacion } from "./conciliar"
import { barrerGastos } from "./gastos"
import { type DepsRespaldo, respaldarBase } from "./respaldo"
import { aplicarRetencion, type DepsRetencion } from "./retencion"
import { type DepsMantenimientoTemas, mantenerTemas } from "./temas"
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

/** What the topic jobs need, or null when they cannot run (no Claude key yet), which is not a failure. */
export type ConstructorDeTemas = () => Promise<DepsMantenimientoTemas | null>

export type DepsFrecuente = DepsConciliacion & DepsArranques & DepsTeoriasAtascadas & { temas: ConstructorDeTemas }
export type DepsNocturno = DepsRetencion & DepsTokenMeta & DepsRespaldo & { temas: ConstructorDeTemas }

const OMITIDO = { omitido: true } as const

/** Every ten minutes: runs that never started, renders that lost their callback, reservations that outlived their run, theories whose synthesis never finished and the topics (embeddings, assignment, formation). */
export function mantenimientoFrecuente(deps: DepsFrecuente) {
  return enSerie({
    arranques: () => reanudarArranques(deps),
    renders: () => conciliarRenders(deps),
    gastos: () => barrerGastos(deps),
    teorias: () => rescatarTeoriasAtascadas(deps),
    temas: async () => {
      const propias = await deps.temas()
      return propias ? mantenerTemas(propias) : OMITIDO
    },
  })
}

/** At 03:00 America/Santiago: file retention, Instagram's token, the backup of the database and the merges of topics. */
export function mantenimientoNocturno(deps: DepsNocturno) {
  return enSerie({
    retencion: () => aplicarRetencion(deps),
    token: () => mantenerTokenMeta(deps),
    respaldo: () => respaldarBase(deps),
    fusiones: async () => {
      const propias = await deps.temas()
      return propias ? fusionarTemas(propias) : OMITIDO
    },
  })
}
