import type { SupabaseClient } from "@supabase/supabase-js"
import { leerZona } from "@/lib/datos/metricas"
import type { AnotarBorrado } from "@/lib/datos-personales/borrados"
import { diaAntes } from "@/lib/datos-personales/fechas"
import { REGLAS_DE_BORRADO } from "@/lib/datos-personales/reglas"
import { diaLocal } from "@/lib/dominio/fechas"
import type { Database } from "@/lib/supabase/database.types"

export interface DepsHuella {
  /** A `service_role` client: nobody else may touch `visitas_clic`. */
  db: SupabaseClient<Database>
  ahora: () => string
  anotarBorrado: AnotarBorrado
}

/**
 * Deletes the daily hashes of `/l` visitors once they are older than yesterday. `registrar_clic` does the same, but
 * only when somebody clicks, so on a quiet week they stayed (spec, gap fixed). Same calendar as the clicks: the zone
 * of `ajustes`.
 */
export async function borrarHuellaDeVisitas(deps: DepsHuella): Promise<{ huellas: number }> {
  const zona = await leerZona(deps.db)
  const hoy = diaLocal(Date.parse(deps.ahora()), zona)
  const corte = diaAntes(hoy, REGLAS_DE_BORRADO.huella_de_visitas)
  const { count, error } = await deps.db.from("visitas_clic").delete({ count: "exact" }).lt("dia", corte)
  if (error) throw new Error(`No pude borrar las huellas de visitas: ${error.message}`, { cause: error })
  const huellas = count ?? 0
  if (huellas > 0) await deps.anotarBorrado("huella_de_visitas", huellas)
  return { huellas }
}
