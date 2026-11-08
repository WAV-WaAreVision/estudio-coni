import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/database.types"

/**
 * How long a run may go without renewing its claim on a material before it counts as dead (issue 114). Every attempt
 * of `procesar-material` stamps `corrida_desde` when it takes the material and lasts at most 30 minutes, so two hours
 * only passes when Trigger.dev killed the run without `onFailure` (a hard timeout, a crash, a deploy).
 */
export const EDAD_DE_CORRIDA_MUERTA_MS = 2 * 60 * 60 * 1000

export const MOTIVO_CORRIDA_MUERTA = "El procesamiento se cortó antes de terminar. Toca Reintentar."

export interface DepsCorridasMuertas {
  /** A `service_role` client: any uploader's material can be left behind by a dead run. */
  db: SupabaseClient<Database>
  ahora: () => string
}

/**
 * Releases the materials a dead run left in `procesando`: without this Coni sees «Procesando» for ever and has no
 * button. The claim goes and a reason offers «Reintentar», as when she deletes a material mid-run. What Coni marked
 * to delete stays with the deferred deletion.
 */
export async function rescatarCorridasMuertas(deps: DepsCorridasMuertas): Promise<{ materiales: string[] }> {
  const corte = new Date(Date.parse(deps.ahora()) - EDAD_DE_CORRIDA_MUERTA_MS).toISOString()
  const { data, error } = await deps.db
    .from("materiales")
    .update({ motivo_fallo: MOTIVO_CORRIDA_MUERTA, corrida_id: null, corrida_desde: null })
    .eq("estado", "procesando")
    .not("corrida_id", "is", null)
    .lt("corrida_desde", corte)
    .is("borrar_desde", null)
    .select("id")
  if (error) throw new Error(`No pude rescatar los materiales de corridas muertas: ${error.message}`, { cause: error })
  return { materiales: data.map((fila) => fila.id) }
}
