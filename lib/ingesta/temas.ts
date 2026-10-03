import type Anthropic from "@anthropic-ai/sdk"
import type { SupabaseClient } from "@supabase/supabase-js"
import { agruparPorSimilitud, centroideIncremental, media, parsearVector, textoDeVector } from "@/lib/ingesta/agrupar"
import { type ContextoDePago, falloDeBase, pagarPaso } from "@/lib/ingesta/gasto-material"
import type { Almacen } from "@/lib/proveedores/almacen"
import {
  confirmarFusiones,
  costoClaude,
  MAXIMO_PARES_POR_FUSION,
  MODELO_POR_TAREA,
  nombrarTemas,
  type ParParaFusionar,
} from "@/lib/proveedores/anthropic"
import type { Database } from "@/lib/supabase/database.types"

type Db = SupabaseClient<Database>

/**
 * Thresholds on the AVERAGE cosine (average linkage) between a claim and a topic's members, or between two topics'
 * members. Measured and decided in docs/superpowers/notas/calibracion-c1.md.
 */
export const UMBRAL_TEMA = 0.8
export const UMBRAL_GRUPO = 0.8
export const MINIMO_AFIRMACIONES_TEMA = 3
export const UMBRAL_FUSION = 0.8
export const MAXIMO_PENDIENTES_POR_CORRIDA = 500

const TEXTOS_POR_GRUPO = 6
const TEXTOS_POR_TEMA_EN_FUSION = 3
const GRUPOS_POR_LLAMADA = 40
// PostgREST carries filters in the URL: big id lists go in slices.
const IDS_POR_CONSULTA = 100
const CAMINO_MAXIMO = 10

export interface DepsTemas {
  /** A `service_role` client. */
  db: Db
  almacen: Almacen
  ahora: () => string
  claude: Anthropic
}

function porTrozos<T>(lista: readonly T[], tamano: number): T[][] {
  const trozos: T[][] = []
  for (let i = 0; i < lista.length; i += tamano) trozos.push(lista.slice(i, i + tamano))
  return trozos
}

/** Same reading of a name the database does for `nombre_normalizado`: lowercase, no accents, trimmed. */
function normalizarNombre(nombre: string): string {
  return nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()
}

function contextoDePago(deps: DepsTemas, tipo: "formar" | "fusionar"): ContextoDePago {
  return {
    db: deps.db,
    almacen: deps.almacen,
    ahora: deps.ahora,
    clave: () => `temas:${tipo}:${crypto.randomUUID()}`,
    verificar: () => Promise.resolve(),
  }
}

async function contarAfirmaciones(db: Db, temaId: string): Promise<number> {
  const { count, error } = await db
    .from("afirmaciones")
    .select("id", { count: "exact", head: true })
    .eq("tema_id", temaId)
    .eq("excluida", false)
  if (error) throw falloDeBase("No pude contar las afirmaciones del tema", error)
  return count ?? 0
}

async function asignarAfirmaciones(db: Db, temaId: string, ids: readonly string[]): Promise<void> {
  for (const trozo of porTrozos(ids, IDS_POR_CONSULTA)) {
    const { error } = await db
      .from("afirmaciones")
      .update({ tema_id: temaId })
      .in("id", trozo)
      .is("tema_id", null)
      .eq("excluida", false)
    if (error) throw falloDeBase("No pude asignar las afirmaciones al tema", error)
  }
}

/** Recomputes a topic's centroid, or deletes the topic (and its merged-away names) when no claims remain. */
export async function recalcularTema(db: Db, temaId: string): Promise<void> {
  const { error } = await db.rpc("recalcular_tema", { p_tema: temaId })
  if (error) throw falloDeBase("No pude recalcular el tema", error)
}

export interface ResultadoAsignacion {
  asignadas: number
  pendientes: number
}

/** Each claim with a vector and no topic goes to the nearest topic over the threshold; the rest stay pending. */
export async function asignarATemas(
  deps: Pick<DepsTemas, "db">,
  afirmacionIds: readonly string[],
): Promise<ResultadoAsignacion> {
  const { db } = deps
  const afirmaciones: { id: string; vector: string }[] = []
  for (const trozo of porTrozos(afirmacionIds, IDS_POR_CONSULTA)) {
    const { data, error } = await db
      .from("afirmaciones")
      .select("id, vector")
      .in("id", trozo)
      .is("tema_id", null)
      .eq("excluida", false)
      .not("vector", "is", null)
      .order("id")
    if (error) throw falloDeBase("No pude leer las afirmaciones por asignar", error)
    for (const fila of data) if (fila.vector) afirmaciones.push({ id: fila.id, vector: fila.vector })
  }
  let asignadas = 0
  // One by one: each claim moves the centroid the next one is measured against.
  for (const afirmacion of afirmaciones) {
    const { data: cercano, error } = await db.rpc("tema_mas_cercano", {
      p_vector: afirmacion.vector,
      p_umbral: UMBRAL_TEMA,
    })
    if (error) throw falloDeBase("No pude buscar el tema más cercano", error)
    const mejor = cercano[0]
    if (!mejor) continue
    const { data: tema, error: errorTema } = await db.from("temas").select("centroide").eq("id", mejor.tema_id).single()
    if (errorTema) throw falloDeBase("No pude leer el centroide del tema", errorTema)
    const n = await contarAfirmaciones(db, mejor.tema_id)
    const nuevo = centroideIncremental(parsearVector(tema.centroide), n, parsearVector(afirmacion.vector))
    const { error: errorCentroide } = await db
      .from("temas")
      .update({ centroide: textoDeVector(nuevo), actualizado_en: new Date().toISOString() })
      .eq("id", mejor.tema_id)
    if (errorCentroide) throw falloDeBase("No pude mover el centroide", errorCentroide)
    await asignarAfirmaciones(db, mejor.tema_id, [afirmacion.id])
    asignadas += 1
  }
  return { asignadas, pendientes: afirmacionIds.length - asignadas }
}

export interface ResultadoFormacion {
  tope: boolean
  creados: number
  unidos: number
  pendientes: number
}

/** The active topic a name leads to: a merged-away name leads to the topic that absorbed it. */
async function temaActivoDeNombre(db: Db, nombre: string): Promise<string | null> {
  const { data, error } = await db
    .from("temas")
    .select("id, fusionado_en")
    .eq("nombre_normalizado", normalizarNombre(nombre))
    .maybeSingle()
  if (error) throw falloDeBase("No pude buscar el tema por nombre", error)
  let actual = data
  for (let paso = 0; actual && paso < CAMINO_MAXIMO; paso++) {
    if (!actual.fusionado_en) return actual.id
    const siguiente = await db.from("temas").select("id, fusionado_en").eq("id", actual.fusionado_en).maybeSingle()
    if (siguiente.error) throw falloDeBase("No pude seguir el tema fusionado", siguiente.error)
    actual = siguiente.data
  }
  return null
}

function estimarNombres(grupos: readonly { textos: string[] }[]): number {
  const caracteres = grupos.reduce((suma, g) => suma + g.textos.reduce((s, t) => s + t.length + 4, 0), 0)
  const uso = { input_tokens: Math.ceil(caracteres / 3) + 1500, output_tokens: grupos.length * 150 + 200 }
  return costoClaude(uso, MODELO_POR_TAREA.nombrarTemas.modelo)
}

/**
 * New topics from pending claims: group them, name each group of enough claims and create (or join) its topic.
 * Smaller groups stay pending for a later run, when more claims may have arrived.
 */
export async function formarTemas(deps: DepsTemas): Promise<ResultadoFormacion> {
  const { db } = deps
  const { data: filas, error } = await db
    .from("afirmaciones")
    .select("id, texto, vector")
    .is("tema_id", null)
    .eq("excluida", false)
    .not("vector", "is", null)
    // Newest first: old singletons that never found a group must not starve the claims that just arrived.
    .order("creada_en", { ascending: false })
    .order("id")
    .limit(MAXIMO_PENDIENTES_POR_CORRIDA)
  if (error) throw falloDeBase("No pude leer las afirmaciones pendientes", error)
  const pendientes = new Map<string, { texto: string; vector: number[] }>()
  for (const fila of filas)
    if (fila.vector) pendientes.set(fila.id, { texto: fila.texto, vector: parsearVector(fila.vector) })

  const grupos = agruparPorSimilitud(
    [...pendientes].map(([id, { vector }]) => ({ id, vector })),
    UMBRAL_GRUPO,
  ).filter((ids) => ids.length >= MINIMO_AFIRMACIONES_TEMA)
  const resultado: ResultadoFormacion = { tope: false, creados: 0, unidos: 0, pendientes: pendientes.size }
  if (grupos.length === 0) return resultado

  const { data: categorias, error: errorCategorias } = await db.from("categorias").select("id, slug")
  if (errorCategorias) throw falloDeBase("No pude leer los pilares", errorCategorias)
  const categoriaDe = new Map(categorias.map((c) => [c.slug, c.id]))
  const pilares = categorias.map((c) => c.slug)

  for (const lote of porTrozos(grupos, GRUPOS_POR_LLAMADA)) {
    const paraNombrar = lote.map((ids, i) => ({
      id: `g${i}`,
      textos: ids.slice(0, TEXTOS_POR_GRUPO).map((id) => pendientes.get(id)?.texto ?? ""),
    }))
    const pagado = await pagarPaso(contextoDePago(deps, "formar"), {
      proveedor: "anthropic",
      paso: "temas",
      estimadoUsd: estimarNombres(paraNombrar),
      llamar: async () => {
        const { temas, uso } = await nombrarTemas({ cliente: deps.claude, grupos: paraNombrar, pilares })
        return { datos: temas, realUsd: costoClaude(uso, MODELO_POR_TAREA.nombrarTemas.modelo) }
      },
    })
    if (pagado.tope) return { ...resultado, tope: true }
    for (const nombrado of pagado.datos) {
      const ids = lote[Number(nombrado.id.slice(1))]
      if (!ids) continue
      const existente = await temaActivoDeNombre(db, nombrado.nombre)
      if (existente) {
        await asignarAfirmaciones(db, existente, ids)
        await recalcularTema(db, existente)
        resultado.unidos += 1
      } else {
        const centroide = media(ids.flatMap((id) => [pendientes.get(id)?.vector ?? []]))
        const { data: creado, error: errorCrear } = await db
          .from("temas")
          .insert({
            nombre: nombrado.nombre,
            descripcion: nombrado.descripcion,
            categoria_id: (nombrado.pilar && categoriaDe.get(nombrado.pilar)) || null,
            centroide: textoDeVector(centroide),
          })
          .select("id")
          .single()
        if (errorCrear) throw falloDeBase("No pude crear el tema", errorCrear)
        await asignarAfirmaciones(db, creado.id, ids)
        resultado.creados += 1
      }
      resultado.pendientes -= ids.length
    }
  }
  return resultado
}

export interface ResultadoFusion {
  tope: boolean
  fusionados: number
}

async function fusionar(db: Db, ganadorId: string, perdedorId: string): Promise<void> {
  const { error } = await db.rpc("fusionar_par_de_temas", { p_ganador: ganadorId, p_perdedor: perdedorId })
  if (error) throw falloDeBase("No pude fusionar los temas", error)
}

/** More claims wins; a tie goes to the older topic, then to the smaller id. */
async function elegirGanador(db: Db, a: string, b: string): Promise<{ ganador: string; perdedor: string }> {
  const [nA, nB] = [await contarAfirmaciones(db, a), await contarAfirmaciones(db, b)]
  if (nA !== nB) return nA > nB ? { ganador: a, perdedor: b } : { ganador: b, perdedor: a }
  const { data, error } = await db.from("temas").select("id, creado_en").in("id", [a, b])
  if (error) throw falloDeBase("No pude leer los temas por fusionar", error)
  const [primero] = [...data].sort((x, y) =>
    x.creado_en < y.creado_en ? -1 : x.creado_en > y.creado_en ? 1 : x.id < y.id ? -1 : 1,
  )
  const ganador = primero?.id ?? a
  return { ganador, perdedor: ganador === a ? b : a }
}

async function paraFusionar(db: Db, id: string): Promise<ParParaFusionar["a"]> {
  const [tema, afirmaciones] = await Promise.all([
    db.from("temas").select("nombre, descripcion").eq("id", id).single(),
    db
      .from("afirmaciones")
      .select("texto")
      .eq("tema_id", id)
      .eq("excluida", false)
      .order("id")
      .limit(TEXTOS_POR_TEMA_EN_FUSION),
  ])
  if (tema.error) throw falloDeBase("No pude leer el tema", tema.error)
  if (afirmaciones.error) throw falloDeBase("No pude leer las afirmaciones del tema", afirmaciones.error)
  return {
    id,
    nombre: tema.data.nombre,
    descripcion: tema.data.descripcion,
    textos: afirmaciones.data.map((f) => f.texto),
  }
}

/**
 * Merges topics that turned out to be the same: pairs of similar centroids, each confirmed by Claude. The topic
 * with more claims survives and keeps the other's name as an alias. A pair Claude rejects is remembered and not asked
 * again (`temas_fusion_rechazada`); merging such a pair would need a manual path.
 */
export async function fusionarTemas(deps: DepsTemas): Promise<ResultadoFusion> {
  const { db } = deps
  const { data: parecidos, error } = await db.rpc("temas_parecidos", { p_umbral: UMBRAL_FUSION })
  if (error) throw falloDeBase("No pude buscar temas parecidos", error)
  const candidatos = parecidos.slice(0, MAXIMO_PARES_POR_FUSION)
  if (candidatos.length === 0) return { tope: false, fusionados: 0 }

  const pares: ParParaFusionar[] = []
  for (const { a, b } of candidatos) pares.push({ a: await paraFusionar(db, a), b: await paraFusionar(db, b) })

  const caracteres = JSON.stringify(pares).length
  const estimado = costoClaude(
    { input_tokens: Math.ceil(caracteres / 3) + 1500, output_tokens: pares.length * 40 + 200 },
    MODELO_POR_TAREA.confirmarFusiones.modelo,
  )
  const pagado = await pagarPaso(contextoDePago(deps, "fusionar"), {
    proveedor: "anthropic",
    paso: "temas",
    estimadoUsd: estimado,
    llamar: async () => {
      const { pares: veredictos, uso } = await confirmarFusiones({ cliente: deps.claude, pares })
      return { datos: veredictos, realUsd: costoClaude(uso, MODELO_POR_TAREA.confirmarFusiones.modelo) }
    },
  })
  if (pagado.tope) return { tope: true, fusionados: 0 }

  const absorbidos = new Map<string, string>()
  const resolver = (id: string): string => {
    let actual = id
    for (let paso = 0; paso < CAMINO_MAXIMO; paso++) {
      const siguiente = absorbidos.get(actual)
      if (!siguiente) return actual
      actual = siguiente
    }
    return actual
  }
  const rechazadas: { tema_a: string; tema_b: string }[] = []
  for (const veredicto of pagado.datos) {
    if (!veredicto.mismo) {
      const [tema_a, tema_b] = [veredicto.a, veredicto.b].sort()
      if (tema_a && tema_b) rechazadas.push({ tema_a, tema_b })
      continue
    }
    const a = resolver(veredicto.a)
    const b = resolver(veredicto.b)
    if (a === b) continue
    const { ganador, perdedor } = await elegirGanador(db, a, b)
    await fusionar(db, ganador, perdedor)
    absorbidos.set(perdedor, ganador)
  }
  if (rechazadas.length > 0) {
    const { error: errorRechazo } = await db
      .from("temas_fusion_rechazada")
      .upsert(rechazadas, { onConflict: "tema_a,tema_b", ignoreDuplicates: true })
    if (errorRechazo) throw falloDeBase("No pude recordar las fusiones rechazadas", errorRechazo)
  }
  return { tope: false, fusionados: absorbidos.size }
}
