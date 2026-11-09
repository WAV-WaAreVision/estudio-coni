import type Anthropic from "@anthropic-ai/sdk"
import type { SupabaseClient } from "@supabase/supabase-js"
import { filasDePilaresAJson, leerPilares } from "@/lib/datos/pilares"
import { elegirVariadas, esDelicada, type PrincipalDeRed } from "@/lib/dominio/fusiones"
import type { Calibracion } from "@/lib/dominio/parecido"
import { soloActivos } from "@/lib/dominio/pilares"
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
  VERSION_DE_FUSIONES,
  type Veredicto,
} from "@/lib/proveedores/anthropic"
import type { Database, TablesInsert } from "@/lib/supabase/database.types"

type Db = SupabaseClient<Database>

/**
 * Thresholds on the AVERAGE cosine (average linkage) between a claim and a topic's members, or between two topics'
 * members, live in the vigente row of `calibraciones_de_parecido` (`leerCalibracion`): each run reads it once and passes
 * it here. Measured for voyage-3.5 in docs/superpowers/notas/calibracion-c1.md.
 */
export const MINIMO_AFIRMACIONES_TEMA = 3
export const MAXIMO_PENDIENTES_POR_CORRIDA = 500

const TEXTOS_POR_GRUPO = 6
const TEXTOS_POR_TEMA_EN_FUSION = 5
// Enough claims to find several authors in a big topic; the five are picked one per author first.
const AFIRMACIONES_PARA_ELEGIR = 60
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
  calibracion: Calibracion,
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
      p_umbral: calibracion.tema,
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
      .update({
        centroide: textoDeVector(nuevo),
        modelo_centroide: calibracion.modelo,
        actualizado_en: new Date().toISOString(),
      })
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
export async function formarTemas(deps: DepsTemas, calibracion: Calibracion): Promise<ResultadoFormacion> {
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
    calibracion.grupo,
  ).filter((ids) => ids.length >= MINIMO_AFIRMACIONES_TEMA)
  const resultado: ResultadoFormacion = { tope: false, creados: 0, unidos: 0, pendientes: pendientes.size }
  if (grupos.length === 0) return resultado

  // Only active categories: a retired pillar is neither offered to Claude nor stored if Claude answers with it.
  // A layer is never a topic's category.
  const { data: categorias, error: errorCategorias } = await db
    .from("categorias")
    .select("id, slug")
    .eq("activa", true)
    .eq("es_capa", false)
  if (errorCategorias) throw falloDeBase("No pude leer los pilares", errorCategorias)
  const categoriaDe = new Map(categorias.map((c) => [c.slug, c.id]))
  const pilares = categorias.map((c) => c.slug)
  // The pillars and layers of each network (spec 2026-11-04, section 4).
  const redes = soloActivos(await leerPilares(db)).filter((p) => p.red !== null)

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
        const { temas, uso } = await nombrarTemas({ cliente: deps.claude, grupos: paraNombrar, pilares, redes })
        return { datos: temas, realUsd: costoClaude(uso, MODELO_POR_TAREA.nombrarTemas.modelo) }
      },
    })
    if (pagado.limite) return { ...resultado, tope: true }
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
            modelo_centroide: calibracion.modelo,
          })
          .select("id")
          .single()
        if (errorCrear) throw falloDeBase("No pude crear el tema", errorCrear)
        // Claims first: a topic without pillars is valid (the next propose run lists it), one without claims is not.
        await asignarAfirmaciones(db, creado.id, ids)
        if (nombrado.pilaresDeRed.length > 0) {
          const { error: errorPilares } = await db.rpc("pilares_automaticos_de_tema", {
            p_tema: creado.id,
            p_filas: filasDePilaresAJson(nombrado.pilaresDeRed),
          })
          if (errorPilares) throw falloDeBase("No pude guardar los pilares del tema", errorPilares)
        }
        resultado.creados += 1
      }
      resultado.pendientes -= ids.length
    }
  }
  return resultado
}

export interface ResultadoFusion {
  tope: boolean
  /** Clear merges applied tonight. */
  fusionados: number
  /** Delicate or doubtful merges left for Coni. */
  propuestas: number
  subtemas: number
  rechazados: number
}

const SIN_FUSIONES: ResultadoFusion = { tope: false, fusionados: 0, propuestas: 0, subtemas: 0, rechazados: 0 }

const claveDePar = (a: string, b: string) => [a, b].sort().join("|")

/** Merges and logs it in one transaction; answers the fusion's id. */
async function fusionar(db: Db, ganadorId: string, perdedorId: string): Promise<string> {
  const { data, error } = await db.rpc("fusionar_par_de_temas", { p_ganador: ganadorId, p_perdedor: perdedorId })
  if (error) throw falloDeBase("No pude fusionar los temas", error)
  return data
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

async function principalesDe(db: Db, temaId: string): Promise<PrincipalDeRed[]> {
  const { data, error } = await db
    .from("tema_pilares")
    .select("pilar_id, red")
    .eq("tema_id", temaId)
    .eq("fuerza", "alta")
    .eq("es_capa", false)
  if (error) throw falloDeBase("No pude leer los pilares del tema", error)
  return data.map((fila) => ({ red: fila.red, pilarId: fila.pilar_id }))
}

async function paraFusionar(db: Db, id: string): Promise<ParParaFusionar["a"]> {
  const [tema, afirmaciones] = await Promise.all([
    db.from("temas").select("nombre, descripcion").eq("id", id).single(),
    db
      .from("afirmaciones")
      .select("texto, autor_id")
      .eq("tema_id", id)
      .eq("excluida", false)
      .order("id")
      .limit(AFIRMACIONES_PARA_ELEGIR),
  ])
  if (tema.error) throw falloDeBase("No pude leer el tema", tema.error)
  if (afirmaciones.error) throw falloDeBase("No pude leer las afirmaciones del tema", afirmaciones.error)
  const variadas = elegirVariadas(
    afirmaciones.data.map((f) => ({ texto: f.texto, autorId: f.autor_id })),
    TEXTOS_POR_TEMA_EN_FUSION,
  )
  return { id, nombre: tema.data.nombre, descripcion: tema.data.descripcion, textos: variadas.map((f) => f.texto) }
}

async function rechazoDe(
  deps: DepsTemas,
  a: string,
  b: string,
  razon: string,
  calibracion: Calibracion,
): Promise<TablesInsert<"temas_fusion_rechazada">> {
  const menor = a < b ? a : b
  const mayor = a < b ? b : a
  return {
    tema_a: menor,
    tema_b: mayor,
    origen: "claude",
    razon,
    afirmaciones_a: await contarAfirmaciones(deps.db, menor),
    afirmaciones_b: await contarAfirmaciones(deps.db, mayor),
    modelo: calibracion.modelo,
    rechazada_en: deps.ahora(),
  }
}

/** Claude's rejection never replaces one Coni made. */
async function guardarRechazoDeClaude(db: Db, fila: TablesInsert<"temas_fusion_rechazada">): Promise<void> {
  const { data: deConi, error: errorConi } = await db
    .from("temas_fusion_rechazada")
    .select("origen")
    .eq("tema_a", fila.tema_a)
    .eq("tema_b", fila.tema_b)
    .eq("origen", "coni")
  if (errorConi) throw falloDeBase("No pude leer los rechazos de Coni", errorConi)
  if (deConi.length > 0) return
  const { error } = await db.from("temas_fusion_rechazada").upsert(fila, { onConflict: "tema_a,tema_b" })
  if (error) throw falloDeBase("No pude recordar la fusión rechazada", error)
}

/** Stores «child under parent» once per pair: a pair already stored in either direction counts as stored. */
export async function guardarSubtema(db: Db, v: Veredicto, a: string, b: string): Promise<void> {
  // `general` names the broader topic by the ids Claude was sent; a and b are those ids after tonight's merges.
  const padre = v.general === v.a ? a : v.general === v.b ? b : (await elegirGanador(db, a, b)).ganador
  const hijo = padre === a ? b : a
  // The table keeps one row per pair whatever its direction (temas_subtemas_un_par): the upsert below only knows the
  // primary key, so the reverse pair is looked up first instead of being caught as a unique violation.
  const { data: guardado, error: errorLectura } = await db
    .from("temas_subtemas")
    .select("tema_id")
    .or(`and(tema_id.eq.${hijo},padre_id.eq.${padre}),and(tema_id.eq.${padre},padre_id.eq.${hijo})`)
    .limit(1)
  if (errorLectura) throw falloDeBase("No pude leer los subtemas", errorLectura)
  if (guardado.length > 0) return
  const { error } = await db.from("temas_subtemas").insert({ tema_id: hijo, padre_id: padre, origen: "claude" })
  if (error) throw falloDeBase("No pude guardar el subtema", error)
}

/**
 * Spec 2026-11-09 (issue 22): pairs of similar centroids, each judged by Claude. «distintos» is remembered with its
 * reason (asked again after 30 % growth or a model change, `temas_parecidos`); «parte_de» is stored as a subtopic; a
 * clear «mismo» is merged and logged at once; a delicate or doubtful one waits for Coni as a proposal. A topic that
 * went into a proposal tonight is left out of the rest of the run, as `temas_parecidos` leaves it out tomorrow.
 */
export async function fusionarTemas(deps: DepsTemas, calibracion: Calibracion): Promise<ResultadoFusion> {
  const { db } = deps
  const { data: parecidos, error } = await db.rpc("temas_parecidos", { p_umbral: calibracion.fusion })
  if (error) throw falloDeBase("No pude buscar temas parecidos", error)
  const candidatos = parecidos.slice(0, MAXIMO_PARES_POR_FUSION)
  if (candidatos.length === 0) return { ...SIN_FUSIONES }
  const parecidoDe = new Map(candidatos.map((c) => [claveDePar(c.a, c.b), c.similitud]))

  const pares: ParParaFusionar[] = []
  for (const { a, b } of candidatos) pares.push({ a: await paraFusionar(db, a), b: await paraFusionar(db, b) })

  const caracteres = JSON.stringify(pares).length
  const estimado = costoClaude(
    // A sentence of reason per pair now comes back with each verdict.
    { input_tokens: Math.ceil(caracteres / 3) + 1500, output_tokens: pares.length * 120 + 200 },
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
  if (pagado.limite) return { ...SIN_FUSIONES, tope: true }

  const resultado: ResultadoFusion = { ...SIN_FUSIONES }
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
  const enPropuesta = new Set<string>()
  for (const v of pagado.datos) {
    const a = resolver(v.a)
    const b = resolver(v.b)
    // A topic absorbed earlier tonight: Claude judged the old texts, so the pair is asked again tomorrow.
    if (a !== v.a || b !== v.b) continue
    if (enPropuesta.has(a) || enPropuesta.has(b)) continue
    if (v.veredicto === "distintos") {
      // Stored at once: a failure later in the run must not make us pay Claude again for this pair.
      await guardarRechazoDeClaude(db, await rechazoDe(deps, a, b, v.razon, calibracion))
      resultado.rechazados += 1
      continue
    }
    if (v.veredicto === "parte_de") {
      await guardarSubtema(db, v, a, b)
      resultado.subtemas += 1
      continue
    }
    const { ganador, perdedor } = await elegirGanador(db, a, b)
    const delicadeza = esDelicada(await principalesDe(db, ganador), await principalesDe(db, perdedor), v.seguro)
    const veredicto = {
      seguro: v.seguro,
      razon: v.razon,
      parecido: parecidoDe.get(claveDePar(v.a, v.b)) ?? null,
      version_prompt: VERSION_DE_FUSIONES,
    }
    if (delicadeza.delicada) {
      const { error: errorPropuesta } = await db.from("fusiones").insert({
        ganador_id: ganador,
        perdedor_id: perdedor,
        origen: "claude",
        veredicto: "mismo",
        modelo: calibracion.modelo,
        delicada: true,
        motivo_delicada: delicadeza.motivo,
        ...veredicto,
      })
      if (errorPropuesta) throw falloDeBase("No pude guardar la propuesta de fusión", errorPropuesta)
      enPropuesta.add(a)
      enPropuesta.add(b)
      resultado.propuestas += 1
      continue
    }
    const fusion = await fusionar(db, ganador, perdedor)
    // The merge and its log are one transaction; Claude's words are completed after it.
    const { error: errorVeredicto } = await db.from("fusiones").update(veredicto).eq("id", fusion)
    if (errorVeredicto) throw falloDeBase("No pude anotar el veredicto de la fusión", errorVeredicto)
    absorbidos.set(perdedor, ganador)
    resultado.fusionados += 1
  }
  return resultado
}
