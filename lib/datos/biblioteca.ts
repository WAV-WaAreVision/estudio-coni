import type { SupabaseClient } from "@supabase/supabase-js"
import { type AutorDeLista, type AutorResumido, armarResumenDeAutores } from "@/lib/dominio/biblioteca/autores"
import type { LoBorrado } from "@/lib/dominio/biblioteca/borrado"
import { type FichaLeida, leerFicha } from "@/lib/dominio/biblioteca/ficha"
import type { FiltrosDeMateriales } from "@/lib/dominio/biblioteca/filtros"
import {
  agruparPorAutor,
  agruparPorTema,
  type GrupoPorAutor,
  type GrupoPorTema,
  type IdeaLeida,
} from "@/lib/dominio/biblioteca/ideas"
import { armarMapa, type FilaDeAfirmacion, type MapaDelMaterial } from "@/lib/dominio/biblioteca/mapa"
import {
  ordenarTemas,
  seguirFusiones,
  type TemaPrincipal,
  type TemaResumido,
  temasPrincipales,
} from "@/lib/dominio/biblioteca/temas"
import {
  esFuerza,
  esRed,
  type PilarDeRed,
  type PilaresDeTema,
  pilaresDeRedes,
  pilaresDeTema,
  type Red,
} from "@/lib/dominio/pilares"
import type { Database } from "@/lib/supabase/database.types"
import { leerTodas } from "./paginas"
import { leerPilares } from "./pilares"

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
    .is("borrar_desde", null)
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
 * The quick filters' counts, and `trabajando`: the materials really working (processing with no reason and no cost
 * waiting for her OK). "Procesando" counts the paused and waiting ones too; only a working one keeps the list asking.
 */
export async function contarPorEstado(db: Db): Promise<{ procesando: number; fallido: number; trabajando: number }> {
  const contar = async (
    nombre: string,
    consulta: PromiseLike<{ count: number | null; error: { message: string } | null }>,
  ) => {
    const { count, error } = await consulta
    if (error) throw new Error(`No pude contar los materiales ${nombre}: ${error.message}`, { cause: error })
    return count ?? 0
  }
  // A marked material is gone for her: it neither counts nor keeps the list asking.
  const cuantos = () => db.from("materiales").select("id", { count: "exact", head: true }).is("borrar_desde", null)
  const [procesando, fallido, trabajando] = await Promise.all([
    contar("procesando", cuantos().eq("estado", "procesando")),
    contar("fallido", cuantos().eq("estado", "fallido")),
    contar(
      "trabajando",
      cuantos()
        .eq("estado", "procesando")
        .is("motivo_fallo", null)
        .or("costo_estimado_usd.is.null,costo_confirmado_en.not.is.null"),
    ),
  ])
  return { procesando, fallido, trabajando }
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
    .is("borrar_desde", null)
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
  const filas = await leerTodas(`las ideas del material ${materialId}`, (despuesDe, limite) => {
    const consulta = db
      .from("afirmaciones")
      .select("id, tema_id, tipo, evidencia, temas ( nombre ), materiales!inner ( borrar_desde )")
      .eq("material_id", materialId)
      .eq("excluida", false)
      .is("materiales.borrar_desde", null)
    return (despuesDe === null ? consulta : consulta.gt("id", despuesDe)).order("id").limit(limite)
  })
  return armarMapa(
    filas.map(({ tema_id, tipo, evidencia, temas }): FilaDeAfirmacion => ({ tema_id, tipo, evidencia, temas })),
  )
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
    const consulta = db.from("autores").select("id, nombre, credencial, tipo, alias").is("borrar_desde", null)
    return (despuesDe === null ? consulta : consulta.gt("id", despuesDe)).order("id").limit(limite)
  })
  return autores.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
}

const COLUMNAS_DE_AUTOR = "id, nombre, credencial, tipo, alias"

/** Every author with what it gave (ported from Ingesta's `resumirAutores`): most visible ideas first (D3). */
export async function resumirAutores(db: Db): Promise<AutorResumido[]> {
  const [autores, materiales, ideas] = await Promise.all([
    listarAutores(db),
    leerTodas("los materiales de los autores", (despuesDe, limite) => {
      const consulta = db.from("materiales").select("id, autor_id").is("borrar_desde", null)
      return (despuesDe === null ? consulta : consulta.gt("id", despuesDe)).order("id").limit(limite)
    }),
    leerTodas("las ideas de los autores", (despuesDe, limite) => {
      const consulta = db
        .from("afirmaciones")
        .select("id, autor_id, tema_id, temas ( nombre ), materiales!inner ( borrar_desde )")
        .eq("excluida", false)
        .is("materiales.borrar_desde", null)
      return (despuesDe === null ? consulta : consulta.gt("id", despuesDe)).order("id").limit(limite)
    }),
  ])
  return armarResumenDeAutores(
    autores,
    materiales.map((material) => ({ autorId: material.autor_id })),
    ideas.map((idea) => ({ autorId: idea.autor_id, temaId: idea.tema_id, tema: idea.temas?.nombre ?? "" })),
  )
}

export interface AutorLeido {
  autor: AutorDeLista
  materiales: number
  /** Visible ideas. */
  ideas: number
  grupos: GrupoPorTema[]
  ocultas: IdeaLeida[]
}

/** One author with its ideas by topic and its hidden ones; null when it does not exist or is not hers to see. */
export async function leerAutor(db: Db, id: string): Promise<AutorLeido | null> {
  const { data: autor, error } = await db
    .from("autores")
    .select(COLUMNAS_DE_AUTOR)
    .eq("id", id)
    .is("borrar_desde", null)
    .maybeSingle()
  if (error) throw new Error(`No pude leer el autor ${id}: ${error.message}`, { cause: error })
  if (!autor) return null
  const [conteo, filas] = await Promise.all([
    db.from("materiales").select("id", { count: "exact", head: true }).eq("autor_id", id).is("borrar_desde", null),
    leerTodas(`las ideas del autor ${id}`, (despuesDe, limite) => {
      const consulta = db
        .from("afirmaciones")
        .select(
          "id, texto, tipo, evidencia, excluida, tema_id, creada_en, temas ( nombre ), materiales!inner ( borrar_desde )",
        )
        .eq("autor_id", id)
        .is("materiales.borrar_desde", null)
      return (despuesDe === null ? consulta : consulta.gt("id", despuesDe)).order("id").limit(limite)
    }),
  ])
  if (conteo.error) {
    throw new Error(`No pude contar los materiales del autor ${id}: ${conteo.error.message}`, { cause: conteo.error })
  }
  const { grupos, ocultas } = agruparPorTema(
    filas.map((fila) => ({
      id: fila.id,
      texto: fila.texto,
      tipo: fila.tipo,
      evidencia: fila.evidencia,
      excluida: fila.excluida,
      temaId: fila.tema_id,
      tema: fila.temas?.nombre ?? "",
      creadaEn: fila.creada_en,
    })),
  )
  return {
    autor,
    materiales: conteo.count ?? 0,
    ideas: grupos.reduce((total, grupo) => total + grupo.ideas.length, 0),
    grupos,
    ocultas,
  }
}

/**
 * The name of what Coni just deleted, for the list's notice; null once it is visible again or gone, so a stale or
 * forged address shows no notice (plan D6).
 */
export async function leerNombreDeLoBorrado(
  db: Db,
  tipo: LoBorrado,
  id: string,
): Promise<{ nombre: string | null } | null> {
  if (tipo === "material") {
    const { data, error } = await db
      .from("materiales")
      .select("titulo")
      .eq("id", id)
      .not("borrar_desde", "is", null)
      .maybeSingle()
    if (error) throw new Error(`No pude leer el material borrado ${id}: ${error.message}`, { cause: error })
    return data ? { nombre: data.titulo } : null
  }
  const { data, error } = await db
    .from("autores")
    .select("nombre")
    .eq("id", id)
    .not("borrar_desde", "is", null)
    .maybeSingle()
  if (error) throw new Error(`No pude leer el autor borrado ${id}: ${error.message}`, { cause: error })
  return data ? { nombre: data.nombre } : null
}

/**
 * The view types every column nullable, but a topic row always has its id and name. One without them is impossible, so
 * it throws: dropping it would shorten the page and make `leerTodas` stop before the last one.
 */
export function conIdYNombre<T extends { id: string | null; nombre: string | null }>(
  fila: T,
): T & { id: string; nombre: string } {
  const { id, nombre } = fila
  if (id === null || nombre === null) {
    throw new Error(`El tema ${id ?? "(sin id)"} de temas_resumen llegó sin id o sin nombre.`)
  }
  return { ...fila, id, nombre }
}

/**
 * The topics of Temas on a network (ported from Ingesta's `listarTemas`), ordered by `ordenarTemas`, each saying
 * whether it went out there. A pillar or layer of that network narrows them (spec 2026-11-04, part 15b):
 * `temas_de_red` joins in the DB, so no list of ids travels in the URL.
 */
export async function listarTemas(db: Db, filtros: { red: Red; pilar?: string }): Promise<TemaResumido[]> {
  const { red, pilar } = filtros
  const filas = await leerTodas(`los temas de ${red}`, (despuesDe, limite) => {
    const todas = db
      .rpc("temas_de_red", { p_red: red, p_pilar: pilar })
      .select("id, nombre, descripcion, categoria_id, afirmaciones, autores, tratado")
    return (despuesDe === null ? todas : todas.gt("id", despuesDe))
      .order("id")
      .limit(limite)
      .then(({ data, error }) => ({ data: data?.map(conIdYNombre) ?? null, error }))
  })
  return ordenarTemas(
    filas.map((fila) => ({
      id: fila.id,
      nombre: fila.nombre,
      descripcion: fila.descripcion,
      pilarId: fila.categoria_id,
      ideas: fila.afirmaciones ?? 0,
      autores: fila.autores ?? 0,
      tratado: fila.tratado === true,
    })),
  )
}

/** The pillars and layers a topic can be filtered by and given: those of a network, LinkedIn first. */
export async function listarPilaresDeTemas(db: Db): Promise<PilarDeRed[]> {
  return pilaresDeRedes(await leerPilares(db))
}

/** The network Temas opens on without `?red` (spec 2026-11-04, part 15b); null until Coni first opens it. */
export async function leerUltimaRed(db: Db): Promise<Red | null> {
  const { data, error } = await db.from("ajustes").select("ultima_red").maybeSingle()
  if (error) throw new Error(`No pude leer la última red de Temas: ${error.message}`, { cause: error })
  const red = data?.ultima_red ?? null
  if (red === null || esRed(red)) return red
  // The column's check lets only the two networks in: anything else means the schema changed under us.
  throw new Error(`La última red de Temas es desconocida: ${red}.`)
}

/** A topic's pillars per network; empty for a topic without rows. */
export async function leerPilaresDeTema(db: Db, temaId: string): Promise<PilaresDeTema> {
  const [catalogo, filas] = await Promise.all([
    leerPilares(db),
    db.from("tema_pilares").select("pilar_id, fuerza").eq("tema_id", temaId),
  ])
  if (filas.error) {
    throw new Error(`No pude leer los pilares del tema ${temaId}: ${filas.error.message}`, { cause: filas.error })
  }
  return pilaresDeTema(
    catalogo,
    filas.data.map((fila) => ({ pilarId: fila.pilar_id, fuerza: esFuerza(fila.fuerza) ? fila.fuerza : null })),
  )
}

export interface TemaLeido {
  tema: { id: string; nombre: string; descripcion: string | null }
  /** Visible ideas. */
  ideas: number
  autores: GrupoPorAutor[]
}

/** One live topic with its visible ideas by author; null when it is missing or was merged into another. */
export async function leerTema(db: Db, id: string): Promise<TemaLeido | null> {
  const { data: tema, error } = await db
    .from("temas")
    .select("id, nombre, descripcion, fusionado_en")
    .eq("id", id)
    .maybeSingle()
  if (error) throw new Error(`No pude leer el tema ${id}: ${error.message}`, { cause: error })
  if (!tema || tema.fusionado_en !== null) return null
  const filas = await leerTodas(`las ideas del tema ${id}`, (despuesDe, limite) => {
    const consulta = db
      .from("afirmaciones")
      .select(
        "id, texto, tipo, evidencia, creada_en, autor_id, autores ( nombre, credencial ), materiales!inner ( borrar_desde )",
      )
      .eq("tema_id", id)
      .eq("excluida", false)
      .is("materiales.borrar_desde", null)
    return (despuesDe === null ? consulta : consulta.gt("id", despuesDe)).order("id").limit(limite)
  })
  return {
    tema: { id: tema.id, nombre: tema.nombre, descripcion: tema.descripcion },
    ideas: filas.length,
    autores: agruparPorAutor(
      filas.map((fila) => ({
        id: fila.id,
        texto: fila.texto,
        tipo: fila.tipo,
        evidencia: fila.evidencia,
        creadaEn: fila.creada_en,
        autorId: fila.autor_id,
        autor: fila.autores?.nombre ?? "",
        credencial: fila.autores?.credencial ?? null,
      })),
    ),
  }
}

/** The live topic an address leads to (D2): itself, the one a merge kept, or null. */
export function destinoDeTema(db: Db, id: string): Promise<string | null> {
  return seguirFusiones(id, async (actual) => {
    const { data, error } = await db.from("temas").select("id, fusionado_en").eq("id", actual).maybeSingle()
    if (error) throw new Error(`No pude leer el tema ${actual}: ${error.message}`, { cause: error })
    return data ? { id: data.id, fusionadoEn: data.fusionado_en } : null
  })
}
