import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/database.types"

/** What spends by itself today (spec 2026-11-02, D2): ON by default, Coni turns it off in Ajustes › Presupuesto. */
export interface Interruptores {
  motorSemanal: boolean
  fusionesNocturnas: boolean
}

export async function leerInterruptores(db: SupabaseClient<Database>): Promise<Interruptores> {
  const { data, error } = await db
    .from("ajustes")
    .select("motor_semanal_activo, fusiones_nocturnas_activas")
    .maybeSingle()
  if (error) throw new Error(`No pude leer los interruptores de Ajustes: ${error.message}`, { cause: error })
  if (!data) throw new Error("Falta la fila de ajustes.")
  return { motorSemanal: data.motor_semanal_activo, fusionesNocturnas: data.fusiones_nocturnas_activas }
}
