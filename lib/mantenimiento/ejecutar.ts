import { existeAviso } from "@/lib/avisos/registro"
import { fusionarTemas } from "@/lib/ingesta/temas"
import { leerInterruptores } from "@/lib/presupuesto/interruptores"
import { avisarLimite, claveDelAvisoDeLimite, mesDelGasto } from "@/lib/presupuesto/limite"
import { type DepsArranques, reanudarArranques } from "./arranques"
import { conciliarRenders, type DepsConciliacion } from "./conciliar"
import { barrerGastos } from "./gastos"
import { borrarHuellaDeVisitas, type DepsHuella } from "./huella"
import { type DepsNumerosLinkedin, recordarNumerosDeLinkedin } from "./numeros-linkedin"
import { type DepsRespaldo, respaldarBase } from "./respaldo"
import { aplicarRetencion, type DepsRetencion } from "./retencion"
import { type DepsRevisionDeInventario, recordarRevisionDeInventario } from "./revision-de-inventario"
import { type DepsMantenimientoTemas, mantenerTemas } from "./temas"
import { type DepsTokenLinkedin, mantenerTokenLinkedin } from "./token-linkedin"
import { type DepsTokenMeta, mantenerTokenMeta } from "./token-meta"
import { devolverVocesTrabadas } from "./voces"

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

export type DepsFrecuente = DepsConciliacion & DepsArranques & { temas: ConstructorDeTemas }
export type DepsNocturno = DepsRetencion &
  DepsTokenMeta &
  DepsTokenLinkedin &
  DepsNumerosLinkedin &
  DepsRespaldo &
  DepsHuella &
  DepsRevisionDeInventario & { temas: ConstructorDeTemas }

const OMITIDO = { omitido: true } as const
const APAGADO = { apagado: true } as const

/**
 * This job meets the limit on every tick of the month, so a notice channel that keeps failing would fail every run and
 * email WAV through `onFailure` up to 144 times a day. Only the month's first failure fails the run (WAV hears once);
 * once the notice row exists, a failed resend is logged and shown in the run's output, and the next tick retries it.
 */
async function avisarLimiteCadaDiezMinutos(deps: DepsFrecuente): Promise<{ avisoPendiente?: string }> {
  const ahora = deps.ahora()
  const yaRegistrado = await existeAviso(deps.db, claveDelAvisoDeLimite(mesDelGasto(ahora)))
  try {
    await avisarLimite(deps, ahora)
    return {}
  } catch (error) {
    if (!(error instanceof Error) || !yaRegistrado) throw error
    console.error("No pude reenviar el aviso del límite del mes", error)
    return { avisoPendiente: error.message }
  }
}

/** Every ten minutes: runs that never started, renders that lost their callback, voices that never finished, reservations that outlived their run and the topics (embeddings, assignment, formation). */
export function mantenimientoFrecuente(deps: DepsFrecuente) {
  return enSerie({
    arranques: () => reanudarArranques(deps),
    renders: () => conciliarRenders(deps),
    voces: () => devolverVocesTrabadas(deps),
    gastos: () => barrerGastos(deps),
    temas: async () => {
      const propias = await deps.temas()
      if (!propias) return OMITIDO
      const resultado = await mantenerTemas(propias)
      if (!resultado.tope) return resultado
      // Silent before the hard limit; now Coni hears it once a month (spec 2026-11-02).
      return { ...resultado, ...(await avisarLimiteCadaDiezMinutos(deps)) }
    },
  })
}

/** At 03:00 America/Santiago: file retention, Instagram's token, LinkedIn's expiry, the Monday reminder of LinkedIn's numbers, the visitor hashes of /l, the backup of the database, the yearly review of the data register and the merges of topics. */
export function mantenimientoNocturno(deps: DepsNocturno) {
  return enSerie({
    retencion: () => aplicarRetencion(deps),
    token: () => mantenerTokenMeta(deps),
    linkedin: () => mantenerTokenLinkedin(deps),
    numerosLinkedin: () => recordarNumerosDeLinkedin(deps),
    // Hashes first, so tonight's backup never keeps hashes older than the rule allows (yesterday's and today's).
    huella: () => borrarHuellaDeVisitas(deps),
    respaldo: () => respaldarBase(deps),
    revisionDeInventario: () => recordarRevisionDeInventario(deps),
    fusiones: async () => {
      const propias = await deps.temas()
      if (!propias) return OMITIDO
      // Read only when there is work: Coni can turn the nightly merges off in Ajustes › Presupuesto (D2).
      if (!(await leerInterruptores(deps.db)).fusionesNocturnas) return APAGADO
      const resultado = await fusionarTemas(propias)
      if (resultado.tope) await avisarLimite(deps, deps.ahora())
      return resultado
    },
  })
}
