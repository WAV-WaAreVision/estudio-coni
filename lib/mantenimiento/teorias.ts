import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/database.types"

export interface DepsTeoriasAtascadas {
  /** A `service_role` client. */
  db: SupabaseClient<Database>
  ahora: () => string
}

/** A synthesis is one Opus call under a five-minute task limit: past this it is not slow, its run is gone. */
export const MINUTOS_PARA_RESCATAR_TEORIA = 15
export const MOTIVO_TEORIA_ATASCADA = "No alcancé a sintetizar la teoría. Reintenta."

const MINUTO_MS = 60_000

/**
 * Marks as fallida the theories still `sintetizando` whose run is gone (the task died without its `onFailure`, or
 * the app never reached Trigger.dev), so Coni sees a retry instead of an endless wait. The update only touches a
 * theory still waiting, so one that got its result in the meantime stays as it is.
 */
export async function rescatarTeoriasAtascadas(deps: DepsTeoriasAtascadas): Promise<{ rescatadas: number }> {
  const limite = new Date(Date.parse(deps.ahora()) - MINUTOS_PARA_RESCATAR_TEORIA * MINUTO_MS).toISOString()
  const { data, error } = await deps.db
    .from("teorias")
    .update({ estado: "fallida", motivo_fallo: MOTIVO_TEORIA_ATASCADA, motivo_codigo: "error" })
    .eq("estado", "sintetizando")
    .lt("sintetizando_desde", limite)
    .select("id")
  if (error) throw new Error(`No pude rescatar las teorías atascadas: ${error.message}`)
  return { rescatadas: data.length }
}
