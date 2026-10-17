import type { SupabaseClient } from "@supabase/supabase-js"
import { type CatalogoDePilares, type DatosDePilar, soloActivos } from "@/lib/dominio/pilares"
import type { Database } from "@/lib/supabase/database.types"

type Db = SupabaseClient<Database>

/** Every pillar (active and retired), ordered: the only place the app learns what the pillars are. */
export async function leerPilares(db: Db): Promise<CatalogoDePilares> {
  const { data, error } = await db
    .from("categorias")
    .select("slug, nombre, nombre_corto, descripcion, activa, orden")
    .eq("es_pilar", true)
    .order("orden")
  if (error) throw new Error(`No pude leer los pilares: ${error.message}`, { cause: error })
  return data.map((fila): DatosDePilar => {
    // The `pilar_completo` check makes both present on a pillar row; null here means the schema changed under us.
    if (fila.nombre_corto === null || fila.orden === null) {
      throw new Error(`El pilar ${fila.slug} no tiene nombre corto u orden.`)
    }
    return {
      slug: fila.slug,
      nombre: fila.nombre,
      nombreCorto: fila.nombre_corto,
      descripcion: fila.descripcion,
      activa: fila.activa,
      orden: fila.orden,
    }
  })
}

export async function pilaresActivos(db: Db): Promise<DatosDePilar[]> {
  return soloActivos(await leerPilares(db))
}
