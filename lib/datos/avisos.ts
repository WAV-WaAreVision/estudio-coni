import type { SupabaseClient } from "@supabase/supabase-js"
import { aFilaDeAviso, type FilaDeAviso } from "@/lib/avisos/registro"
import type { Database } from "@/lib/supabase/database.types"

/** The notices she has not opened, newest first, through her own session (row level security makes them hers). */
export async function leerAvisosSinLeer(db: SupabaseClient<Database>, limite: number): Promise<FilaDeAviso[]> {
  const { data, error } = await db
    .from("avisos")
    .select("*")
    .is("leido_en", null)
    .order("creado_en", { ascending: false })
    .limit(limite)
  if (error) throw new Error(`No pude leer tus avisos: ${error.message}`, { cause: error })
  return data.map(aFilaDeAviso)
}
