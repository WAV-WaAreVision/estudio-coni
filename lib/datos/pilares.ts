import type { SupabaseClient } from "@supabase/supabase-js"
import {
  type CatalogoDePilares,
  calcularPesosDeRed,
  type DatosDePilar,
  esRed,
  type FilaDePilarElegida,
  ordenarPilares,
  type PesosDeRed,
  pilaresParaElegir,
  type Red,
  soloActivos,
} from "@/lib/dominio/pilares"
import type { Database, Json } from "@/lib/supabase/database.types"

type Db = SupabaseClient<Database>

function leerRed(slug: string, red: string | null): Red | null {
  if (red === null || esRed(red)) return red
  throw new Error(`El pilar ${slug} tiene una red desconocida: ${red}.`)
}

/** Every pillar (active and retired), ordered by network: the only place the app learns what the pillars are. */
export async function leerPilares(db: Db): Promise<CatalogoDePilares> {
  const { data, error } = await db
    .from("categorias")
    .select("id, slug, nombre, nombre_corto, descripcion, activa, orden, red, es_capa")
    .eq("es_pilar", true)
  if (error) throw new Error(`No pude leer los pilares: ${error.message}`, { cause: error })
  return ordenarPilares(
    data.map((fila): DatosDePilar => {
      // The `pilar_completo` check makes both present on a pillar row; null here means the schema changed under us.
      if (fila.nombre_corto === null || fila.orden === null) {
        throw new Error(`El pilar ${fila.slug} no tiene nombre corto u orden.`)
      }
      return {
        id: fila.id,
        slug: fila.slug,
        nombre: fila.nombre,
        nombreCorto: fila.nombre_corto,
        descripcion: fila.descripcion,
        activa: fila.activa,
        orden: fila.orden,
        red: leerRed(fila.slug, fila.red),
        esCapa: fila.es_capa,
      }
    }),
  )
}

export async function pilaresActivos(db: Db): Promise<DatosDePilar[]> {
  return soloActivos(await leerPilares(db))
}

/** The pillars an idea can take: active, never a layer. */
export async function pilaresElegibles(db: Db): Promise<DatosDePilar[]> {
  return pilaresParaElegir(await leerPilares(db))
}

/** A network's weights on a date (YYYY-MM-DD), with the flag the 15c panel warns on. */
export async function pesosDeRed(db: Db, red: Red, fecha: string): Promise<PesosDeRed> {
  const [catalogo, pesos] = await Promise.all([leerPilares(db), db.from("pilar_pesos").select("pilar_id, desde, peso")])
  if (pesos.error)
    throw new Error(`No pude leer los pesos de los pilares: ${pesos.error.message}`, { cause: pesos.error })
  return calcularPesosDeRed(
    catalogo,
    pesos.data.map((fila) => ({ pilarId: fila.pilar_id, desde: fila.desde, peso: fila.peso })),
    red,
    fecha,
  )
}

/** Rows for the pillar RPCs, as the plain JSON their `p_filas` takes. */
export function filasDePilaresAJson(filas: readonly FilaDePilarElegida[]): Json {
  return filas.map((fila) => ({ pilar: fila.pilar, fuerza: fila.fuerza }))
}
