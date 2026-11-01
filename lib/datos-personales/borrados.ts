import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/database.types"
import type { ReglaDeBorrado } from "./reglas"

/** Writes down that a rule deleted `cantidad` things tonight. Never what they were. */
export type AnotarBorrado = (regla: ReglaDeBorrado, cantidad: number) => Promise<void>

/** The log of the nightly maintenance, with a `service_role` client. A night that deleted nothing writes nothing. */
export function anotadorDeBorrados(db: SupabaseClient<Database>, ahora: () => string): AnotarBorrado {
  return async (regla, cantidad) => {
    // Only zero is skipped: a negative count is a bug, and the table's check turns it into an error.
    if (cantidad === 0) return
    const { error } = await db.from("registro_de_borrados").insert({ regla, cantidad, borrado_en: ahora() })
    if (error) throw new Error(`No pude anotar el borrado de ${regla}: ${error.message}`, { cause: error })
  }
}
