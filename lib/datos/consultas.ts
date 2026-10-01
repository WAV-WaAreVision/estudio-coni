import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/database.types"

type Db = SupabaseClient<Database>

function fallo(contexto: string, error: { message: string }): Error {
  return new Error(`${contexto}: ${error.message}`, { cause: error })
}

/** The moments consultations were noted since `desde`, as ISO instants; the totals are computed from them. */
export async function leerConsultas(db: Db, desde: string): Promise<string[]> {
  const { data, error } = await db
    .from("consultas")
    .select("anotada_en")
    .gte("anotada_en", desde)
    .order("anotada_en", { ascending: false })
  if (error) throw fallo("No pude leer las consultas", error)
  return data.map((fila) => fila.anotada_en)
}

export async function crearConsulta(db: Db): Promise<string> {
  const { data, error } = await db.from("consultas").insert({}).select("id").single()
  if (error) throw fallo("No pude anotar la consulta", error)
  return data.id
}

/** True when a row was removed. */
export async function borrarConsulta(db: Db, id: string): Promise<boolean> {
  const { data, error } = await db.from("consultas").delete().eq("id", id).select("id")
  if (error) throw fallo("No pude deshacer la consulta", error)
  return data.length > 0
}
