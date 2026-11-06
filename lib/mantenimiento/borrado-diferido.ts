import type { SupabaseClient } from "@supabase/supabase-js"
import type { Almacen } from "@/lib/proveedores/almacen"
import type { Database } from "@/lib/supabase/database.types"

/** How long after «Borrar» a row is deleted for real: past the 8 s of «Deshacer», one constant (spec, Deviations). */
export const MARGEN_DE_BORRADO_MS = 60_000

export interface DepsBorrado {
  /** A `service_role` client: only it may run `borrar_lo_marcado`. */
  db: SupabaseClient<Database>
  almacen: Pick<Almacen, "borrarCarpeta">
  ahora: () => string
}

/**
 * Deletes what Coni marked over a minute ago, then each deleted material's R2 folder. A folder that fails stays as an
 * orphan, named in the log, as Ingesta's delete already accepts: the rows are gone and the run must not fail for it.
 */
export async function borrarLoMarcado(
  deps: DepsBorrado,
): Promise<{ materiales: number; carpetasPendientes: string[] }> {
  const corte = new Date(Date.parse(deps.ahora()) - MARGEN_DE_BORRADO_MS).toISOString()
  const { data, error } = await deps.db.rpc("borrar_lo_marcado", { p_antes: corte })
  if (error) throw new Error(`No pude borrar lo marcado: ${error.message}`, { cause: error })
  const carpetasPendientes: string[] = []
  for (const materialId of data) {
    try {
      await deps.almacen.borrarCarpeta(materialId)
    } catch (errorDeAlmacen) {
      console.error(`El material ${materialId} se borró, pero sus archivos de R2 quedaron huérfanos`, errorDeAlmacen)
      carpetasPendientes.push(materialId)
    }
  }
  return { materiales: data.length, carpetasPendientes }
}
