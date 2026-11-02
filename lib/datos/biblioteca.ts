import type { SupabaseClient } from "@supabase/supabase-js"
import type { AutorDeLista } from "@/lib/dominio/biblioteca/autores"
import { type FichaLeida, leerFicha } from "@/lib/dominio/biblioteca/ficha"
import type { FiltrosDeMateriales } from "@/lib/dominio/biblioteca/filtros"
import { armarMapa, type FilaDeAfirmacion, type MapaDelMaterial } from "@/lib/dominio/biblioteca/mapa"
import { type TemaPrincipal, temasPrincipales } from "@/lib/dominio/biblioteca/temas"
import type { Database } from "@/lib/supabase/database.types"
import { leerTodas } from "./paginas"

type Db = SupabaseClient<Database>

/** The list shows the latest hundred: search (change 1) is how she reaches older ones. */
export const MAXIMO_DE_MATERIALES = 100

export interface MaterialDeLista {
  id: string
  titulo: string | null
  autor_id: string
  autor: string
  rol: string
  tipo: string
  estado: string
  motivo_fallo: string | null
  costo_estimado_usd: number | null
  costo_confirmado_en: string | null
  creado_en: string
  tema: TemaPrincipal | null
}

const COLUMNAS =
  "id, titulo, autor_id, rol, tipo, estado, motivo_fallo, costo_estimado_usd, costo_confirmado_en, creado_en"

/**
 * The main topic of each listed material, from their non-excluded ideas with a topic, paged by id past the 1000-row
 * limit (D8). The pure function filters the same rows again: the rule stays in one tested place.
 */
async function leerTemasPrincipales(db: Db, ids: string[]): Promise<Map<string, TemaPrincipal>> {
  if (ids.length === 0) return new Map()
  const filas = await leerTodas("los temas de los materiales", (despuesDe, limite) => {
    const consulta = db
      .from("afirmaciones")
      .select("id, material_id, tema_id, excluida, temas ( nombre )")
      .in("material_id", ids)
      .eq("excluida", false)
      .not("tema_id", "is", null)
    return (despuesDe === null ? consulta : consulta.gt("id", despuesDe)).order("id").limit(limite)
  })
  return temasPrincipales(
    filas.map((fila) => ({
      materialId: fila.material_id,
      temaId: fila.tema_id,
      nombre: fila.temas?.nombre ?? "",
      excluida: fila.excluida,
    })),
  )
}

/** The latest materials, newest first, with their author and main topic; the filters are the ones of the URL. */
export async function listarMateriales(db: Db, filtros: FiltrosDeMateriales): Promise<MaterialDeLista[]> {
  let consulta = db
    .from("materiales")
    .select(`${COLUMNAS}, autores ( nombre )`)
    .order("creado_en", { ascending: false })
    .order("id")
    .limit(MAXIMO_DE_MATERIALES)
  if (filtros.autor) consulta = consulta.eq("autor_id", filtros.autor)
  if (filtros.rol) consulta = consulta.eq("rol", filtros.rol)
  if (filtros.tipo) consulta = consulta.eq("tipo", filtros.tipo)
  if (filtros.estado) consulta = consulta.eq("estado", filtros.estado)
  const { data, error } = await consulta
  if (error) throw new Error(`No pude leer los materiales: ${error.message}`, { cause: error })
  const temas = await leerTemasPrincipales(
    db,
    data.map((material) => material.id),
  )
  return data.map(({ autores, ...material }) => ({
    ...material,
    autor: autores?.nombre ?? "",
    tema: temas.get(material.id) ?? null,
  }))
}

/**
 * How many materials are processing and how many failed: the counts of the quick filters (4b). "Procesando · N" counts
 * every `procesando` row on purpose, so it includes the ones in pause and the ones waiting for Coni's OK: they are the
 * same database state, and the filter that the count sits on lists exactly those rows too.
 */
export async function contarPorEstado(db: Db): Promise<{ procesando: number; fallido: number }> {
  const contar = async (estado: "procesando" | "fallido") => {
    const { count, error } = await db
      .from("materiales")
      .select("id", { count: "exact", head: true })
      .eq("estado", estado)
    if (error) throw new Error(`No pude contar los materiales ${estado}: ${error.message}`, { cause: error })
    return count ?? 0
  }
  const [procesando, fallido] = await Promise.all([contar("procesando"), contar("fallido")])
  return { procesando, fallido }
}

export interface MaterialLeido extends Omit<MaterialDeLista, "tema"> {
  credencial: string | null
  idioma_original: string | null
  origen_url: string | null
}

/** One material with its author and its card (null while it has none, or when the card cannot be read). */
export async function leerMaterialConFicha(
  db: Db,
  id: string,
): Promise<{ material: MaterialLeido; ficha: FichaLeida | null } | null> {
  const { data, error } = await db
    .from("materiales")
    .select(
      `${COLUMNAS}, idioma_original, origen_url, autores ( nombre, credencial ), fichas ( resumen, ideas_clave, citas, fuente )`,
    )
    .eq("id", id)
    .maybeSingle()
  if (error) throw new Error(`No pude leer el material ${id}: ${error.message}`, { cause: error })
  if (!data) return null
  const { autores, fichas, ...material } = data
  const fila = Array.isArray(fichas) ? fichas[0] : fichas
  const ficha = fila ? leerFicha(fila) : null
  if (fila && !ficha) console.error(`La ficha del material ${id} no tiene la forma que escribe la tarea`)
  return {
    material: { ...material, autor: autores?.nombre ?? "", credencial: autores?.credencial ?? null },
    ficha,
  }
}

/** The map of a material: what its ideas are about and how they are backed. Excluded ideas are not part of it. */
export async function leerMapaDelMaterial(db: Db, materialId: string): Promise<MapaDelMaterial> {
  const filas: FilaDeAfirmacion[] = await leerTodas(`las ideas del material ${materialId}`, (despuesDe, limite) => {
    const consulta = db
      .from("afirmaciones")
      .select("id, tema_id, tipo, evidencia, temas ( nombre )")
      .eq("material_id", materialId)
      .eq("excluida", false)
    return (despuesDe === null ? consulta : consulta.gt("id", despuesDe)).order("id").limit(limite)
  })
  return armarMapa(filas)
}

export interface PanelDelMaterial {
  material: MaterialLeido
  ideas: { total: number; primeras: string[] }
  evidencia: Record<string, number>
}

/** What the desktop side panel shows (D9): the ideas taken (count and first two) and the evidence for WAV. */
export async function leerPanelDelMaterial(db: Db, id: string): Promise<PanelDelMaterial | null> {
  const leido = await leerMaterialConFicha(db, id)
  if (!leido) return null
  const { material, ficha } = leido
  if (material.rol === "estrategia") {
    const ideas = ficha?.ideasClave ?? []
    return { material, ideas: { total: ideas.length, primeras: ideas.slice(0, 2) }, evidencia: {} }
  }
  const [mapa, primeras] = await Promise.all([
    leerMapaDelMaterial(db, id),
    db
      .from("afirmaciones")
      .select("texto")
      .eq("material_id", id)
      .eq("excluida", false)
      .order("creada_en")
      .order("id")
      .limit(2),
  ])
  if (primeras.error) {
    throw new Error(`No pude leer las ideas del material ${id}: ${primeras.error.message}`, { cause: primeras.error })
  }
  return {
    material,
    ideas: { total: mapa.total, primeras: primeras.data.map((fila) => fila.texto) },
    evidencia: mapa.evidencia,
  }
}

/** The authors in alphabetical order. Row level security shows nothing to someone who is not Coni or WAV. */
export async function listarAutores(db: Db): Promise<AutorDeLista[]> {
  const autores = await leerTodas("los autores", (despuesDe, limite) => {
    const consulta = db.from("autores").select("id, nombre, credencial, tipo, alias")
    return (despuesDe === null ? consulta : consulta.gt("id", despuesDe)).order("id").limit(limite)
  })
  return autores.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
}
