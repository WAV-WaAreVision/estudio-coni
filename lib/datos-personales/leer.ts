import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/database.types"

type Db = SupabaseClient<Database>

function fallo(que: string, error: { message: string }): Error {
  return new Error(`No pude leer ${que}: ${error.message}`, { cause: error })
}

export interface FechasDeRevision {
  /** When Coni last tapped «Lo revisé», or null. */
  ultima: string | null
  /** `ajustes.inventario_desde`: the base of the first review. */
  desde: string
  zona: string
  /** The due date already notified, or null. */
  avisada: string | null
}

/** What the yearly review is computed from. Works with Coni's session or with `service_role`. */
export async function leerFechasDeRevision(db: Db): Promise<FechasDeRevision> {
  const [revision, ajustes] = await Promise.all([
    db
      .from("revisiones_de_inventario")
      .select("revisado_en")
      .order("revisado_en", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db.from("ajustes").select("zona, inventario_desde, revision_de_inventario_avisada").single(),
  ])
  if (revision.error) throw fallo("la última revisión del registro", revision.error)
  if (ajustes.error) throw fallo("los ajustes", ajustes.error)
  return {
    ultima: revision.data?.revisado_en ?? null,
    desde: ajustes.data.inventario_desde,
    zona: ajustes.data.zona,
    avisada: ajustes.data.revision_de_inventario_avisada,
  }
}
