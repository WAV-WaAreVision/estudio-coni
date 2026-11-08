import type { SupabaseClient } from "@supabase/supabase-js"
import type { Almacen } from "@/lib/proveedores/almacen"
import type { Database } from "@/lib/supabase/database.types"

/**
 * When an upload nobody confirmed counts as abandoned (issue 63). The database does not record the confirmation, so a
 * confirmed material waiting in `procesar-material`'s queue (two at a time) looks the same as an abandoned one: six
 * hours is far past any realistic queue, and past the hour the upload link lives.
 */
export const EDAD_DE_ABANDONO_MS = 6 * 60 * 60 * 1000

export interface DepsMaterialesAbandonados {
  /** A `service_role` client: the sweep deletes any uploader's rows. */
  db: SupabaseClient<Database>
  almacen: Pick<Almacen, "borrarCarpeta">
  ahora: () => string
}

/**
 * Deletes the materials left in `procesando` by an upload that was never confirmed or thrown away (an expired session,
 * a closed tab), then their R2 folders. Untouched: anything a run took (`corrida_id`), estimated (`costo_estimado_usd`)
 * or explained (`motivo_fallo`), and what Coni marked to delete (the deferred deletion owns it). A folder that fails
 * stays as an orphan, named in the log, as the deferred deletion already accepts.
 */
export async function barrerMaterialesAbandonados(
  deps: DepsMaterialesAbandonados,
): Promise<{ materiales: string[]; carpetasPendientes: string[] }> {
  const corte = new Date(Date.parse(deps.ahora()) - EDAD_DE_ABANDONO_MS).toISOString()
  const { data, error } = await deps.db
    .from("materiales")
    .delete()
    .eq("estado", "procesando")
    .is("motivo_fallo", null)
    .is("corrida_id", null)
    .is("costo_estimado_usd", null)
    .is("borrar_desde", null)
    .lt("creado_en", corte)
    .select("id")
  if (error) throw new Error(`No pude barrer los materiales abandonados: ${error.message}`, { cause: error })
  const materiales = data.map((fila) => fila.id)
  const carpetasPendientes: string[] = []
  for (const materialId of materiales) {
    try {
      await deps.almacen.borrarCarpeta(materialId)
    } catch (errorDeAlmacen) {
      console.error(
        `El material abandonado ${materialId} se borró, pero sus archivos de R2 quedaron huérfanos`,
        errorDeAlmacen,
      )
      carpetasPendientes.push(materialId)
    }
  }
  return { materiales, carpetasPendientes }
}
