import type { SupabaseClient } from "@supabase/supabase-js"
import { claveGrabar, claveProducir } from "@/lib/acciones/disparos"
import { type FilaDePieza, leerPiezasSinArrancar } from "@/lib/datos/repositorio"
import type { Database } from "@/lib/supabase/database.types"

export interface DepsArranques {
  /** A `service_role` client. */
  db: SupabaseClient<Database>
  ahora: () => string
  /** Starts `grabar-pieza` for this attempt under this idempotency key (the key of the approval). */
  dispararGrabacion: (piezaId: string, clave: string, intento: number) => Promise<void>
  /** Starts `producir-pieza` under this idempotency key (the key of the script round). */
  dispararProduccion: (piezaId: string, clave: string) => Promise<void>
}

export type ResultadoArranque = { piezaId: string; tarea: "grabar" | "producir" }

const MINUTO_MS = 60_000
/** A recording starts within seconds of the approval: ten quiet minutes mean the run never started. */
const MINUTOS_SIN_GRABAR = 10
/** A script takes a minute or two, queue included: fifteen quiet minutes mean the run never started. */
const MINUTOS_SIN_GUION = 15

/**
 * The app starts the runs after saving the approval, and says so to Coni when it cannot reach Trigger.dev; this is
 * the net under that warning. It asks again with the same idempotency key the app used, so a run that did start is
 * not doubled (Trigger.dev answers with the first run) and one that did not is started now. Asking on every tick is
 * safe for the same reason; `conciliarRenders` gives the piece up after an hour.
 */
export async function reanudarArranques(deps: DepsArranques): Promise<ResultadoArranque[]> {
  const ahora = Date.parse(deps.ahora())
  const antesDe = (minutos: number) => new Date(ahora - minutos * MINUTO_MS).toISOString()
  const { aGrabar, aProducir } = await leerPiezasSinArrancar(deps.db, {
    grabarAntesDe: antesDe(MINUTOS_SIN_GRABAR),
    producirAntesDe: antesDe(MINUTOS_SIN_GUION),
  })

  const trabajos: { fila: FilaDePieza; tarea: ResultadoArranque["tarea"]; arrancar: () => Promise<void> }[] = [
    ...aGrabar.map((fila) => ({
      fila,
      tarea: "grabar" as const,
      arrancar: () => deps.dispararGrabacion(fila.id, claveGrabar(fila), fila.intento),
    })),
    ...aProducir.map((fila) => ({
      fila,
      tarea: "producir" as const,
      arrancar: () => deps.dispararProduccion(fila.id, claveProducir(fila)),
    })),
  ]

  const resultados: ResultadoArranque[] = []
  const errores: Error[] = []
  for (const { fila, tarea, arrancar } of trabajos) {
    try {
      await arrancar()
      resultados.push({ piezaId: fila.id, tarea })
    } catch (error) {
      if (!(error instanceof Error)) throw error
      errores.push(new Error(`pieza ${fila.id} (${tarea}): ${error.message}`, { cause: error }))
    }
  }
  if (errores.length > 0) {
    throw new AggregateError(errores, `No pude reanudar los arranques: ${errores.map((e) => e.message).join(" | ")}`)
  }
  return resultados
}
