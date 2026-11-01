import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { exigirEnv } from "@/lib/env"
import type { Database } from "@/lib/supabase/database.types"

export interface TransparenciaVigente {
  texto: string
  creadaEn: string
}

/** D6: the public page reads with the anon key, which reaches transparencia_vigente() and nothing else of this. */
export function clienteAnonimo(): SupabaseClient<Database> {
  return createClient<Database>(
    exigirEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    exigirEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

/** The current text of /l/ia, or null while Coni has published nothing (D7). A failure throws. */
export async function leerTransparenciaVigente(db: SupabaseClient<Database>): Promise<TransparenciaVigente | null> {
  const { data, error } = await db.rpc("transparencia_vigente")
  if (error) throw new Error(`No pude leer la página de IA: ${error.message}`, { cause: error })
  const fila = data.at(0)
  return fila ? { texto: fila.texto, creadaEn: fila.creada_en } : null
}
