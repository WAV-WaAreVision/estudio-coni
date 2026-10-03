import type Anthropic from "@anthropic-ai/sdk"
import type { SupabaseClient } from "@supabase/supabase-js"
import { leerGuiaVigente } from "@/lib/datos/repositorio"
import { falloDeBase, pagarPaso, redondear } from "@/lib/ingesta/gasto-material"
import { MOTIVO_TOPE } from "@/lib/ingesta/procesar"
import { type DatosDelMotor, leerDatosDelMotor, type TemaDelMotor } from "@/lib/motor/datos"
import {
  CRUCES_POR_SEMANA,
  elegirCruces,
  elegirTemasSolos,
  MINIMO_CRUCES_PARA_NO_ARRANQUE_EN_FRIO,
  puntuarTemaSolo,
  reporteQueSubir,
} from "@/lib/motor/puntaje"
import type { Almacen } from "@/lib/proveedores/almacen"
import {
  type CruceParaTeoria,
  costoClaude,
  escribirTeorias,
  MODELO_POR_TAREA,
  type TeoriaDelMotor,
} from "@/lib/proveedores/anthropic"
import type { Database } from "@/lib/supabase/database.types"

type Db = SupabaseClient<Database>

export interface DepsDelMotor {
  db: Db
  claude: Anthropic
  almacen: Almacen
  ahora: () => string
}

export type ResultadoDelMotor =
  | { resultado: "ya_corrio" }
  | { resultado: "fallida"; motivo: string }
  | { resultado: "lista"; resumen: ResumenDeCorrida }

type ResumenDeCorrida = {
  cruces: { ids: string[]; nombres: string[]; puntaje: number }[]
  teorias: number
  descartadas: { cruceId: string; razon: string }[]
  ideas: number
  archivadas: number
  queSubir: ReturnType<typeof reporteQueSubir>
}

const AFIRMACIONES_POR_TEMA = 8
const AFIRMACIONES_DE_VOZ = 20
const SEMANAS_PARA_ARCHIVAR = 6
const AFIRMACIONES_MINIMAS_DE_TEMA_SOLO = 2
const PUNTAJE_IDEA_ALTA = 0.6
const PUNTAJE_IDEA_MEDIA = 0.4
const CARACTERES_POR_TOKEN = 3
const TOKENS_FIJOS = 2_500
const TOKENS_DE_SALIDA_POR_CRUCE = 1_500
const UNIQUE_VIOLATION = "23505"
const MOTIVO_DE_FALLA = "No pude armar las ideas de esta semana. Avisamos al equipo; puedes volver a intentarlo."

interface CruceElegido {
  id: string
  temas: TemaDelMotor[]
  puntaje: number
  componentes: Record<string, number>
}

function elegir(datos: DatosDelMotor): { cruces: CruceElegido[]; arranqueEnFrio: boolean } {
  const temasPorId = new Map(datos.temas.map((t) => [t.tema_id, t]))
  const cruces = elegirCruces(datos.pares, datos.temas, datos).flatMap((c, i): CruceElegido[] => {
    const a = temasPorId.get(c.par.a)
    const b = temasPorId.get(c.par.b)
    return a && b ? [{ id: `c${i + 1}`, temas: [a, b], puntaje: c.puntaje, componentes: { ...c.componentes } }] : []
  })
  if (cruces.length >= MINIMO_CRUCES_PARA_NO_ARRANQUE_EN_FRIO) return { cruces, arranqueEnFrio: false }

  // Cold start: the 2-author rule relaxes to "at least 2 claims" and each single topic goes as a crossing of one.
  const usados = new Set(cruces.flatMap((c) => c.temas.map((t) => t.tema_id)))
  const candidatos = datos.temas.filter(
    (t) => !usados.has(t.tema_id) && t.afirmaciones >= AFIRMACIONES_MINIMAS_DE_TEMA_SOLO,
  )
  const solos = elegirTemasSolos(candidatos, datos, CRUCES_POR_SEMANA - cruces.length).map((t, i): CruceElegido => {
    const { puntaje, componentes } = puntuarTemaSolo(t, datos)
    return { id: `c${cruces.length + i + 1}`, temas: [t], puntaje, componentes }
  })
  return { cruces: [...cruces, ...solos], arranqueEnFrio: true }
}

async function afirmacionesDe(db: Db, temaId: string) {
  const { data, error } = await db.rpc("motor_afirmaciones_de_tema", {
    p_tema: temaId,
    p_limite: AFIRMACIONES_POR_TEMA,
  })
  if (error) throw falloDeBase("No pude leer las afirmaciones del tema", error)
  return data
}

async function contextoEditorial(db: Db) {
  const guia = await leerGuiaVigente(db)
  const fichas = await db
    .from("fichas")
    .select("resumen, materiales!inner(rol)")
    .eq("materiales.rol", "estrategia")
    .order("material_id")
  if (fichas.error) throw falloDeBase("No pude leer las fichas de estrategia", fichas.error)
  const voz = await db
    .from("afirmaciones")
    .select("texto, materiales!inner(rol)")
    .eq("materiales.rol", "voz_propia")
    .eq("excluida", false)
    .order("creada_en", { ascending: false })
    .order("id")
    .limit(AFIRMACIONES_DE_VOZ)
  if (voz.error) throw falloDeBase("No pude leer la voz propia", voz.error)
  return {
    guia: guia?.texto ?? "",
    estrategia: fichas.data.map((f) => f.resumen),
    vozPropia: voz.data.map((a) => a.texto),
  }
}

function estimarEscritura(cruces: readonly CruceParaTeoria[], contexto: object): number {
  const caracteres = JSON.stringify(cruces).length + JSON.stringify(contexto).length
  return redondear(
    costoClaude(
      {
        input_tokens: Math.ceil(caracteres / CARACTERES_POR_TOKEN) + TOKENS_FIJOS,
        output_tokens: TOKENS_DE_SALIDA_POR_CRUCE * cruces.length,
      },
      MODELO_POR_TAREA.escribirTeorias.modelo,
    ),
  )
}

const fuerzaDe = (puntaje: number): "alta" | "media" | "baja" =>
  puntaje >= PUNTAJE_IDEA_ALTA ? "alta" : puntaje >= PUNTAJE_IDEA_MEDIA ? "media" : "baja"

async function guardarTeorias(
  db: Db,
  semana: string,
  elegidos: ReadonlyMap<string, CruceElegido>,
  teorias: readonly TeoriaDelMotor[],
  descartadas: readonly { cruceId: string; razon: string }[],
): Promise<{ teoriaId: string; teoria: TeoriaDelMotor; cruce: CruceElegido }[]> {
  const guardadas: { teoriaId: string; teoria: TeoriaDelMotor; cruce: CruceElegido }[] = []
  for (const teoria of teorias) {
    const cruce = elegidos.get(teoria.cruceId)
    if (!cruce) continue
    const { data, error } = await db
      .from("teorias")
      .insert({
        origen: "motor",
        semana,
        estado: "guardada",
        titulo: teoria.titulo,
        tesis: teoria.tesis,
        por_que: teoria.porQue,
        argumentos: teoria.aportes,
        contradicciones: teoria.tensiones,
        temas: cruce.temas.map((t) => t.tema_id),
        puntaje: cruce.puntaje,
        componentes: cruce.componentes,
        nivel_evidencia: teoria.nivelEvidencia,
        advertencias: teoria.advertencias,
      })
      .select("id")
      .single()
    if (error) throw falloDeBase("No pude guardar la teoría", error)
    const respaldo = await db
      .from("teoria_afirmaciones")
      .insert(teoria.aportes.map((a) => ({ teoria_id: data.id, afirmacion_id: a.afirmacionId, aporte: a.aporte })))
    if (respaldo.error) throw falloDeBase("No pude guardar el respaldo de la teoría", respaldo.error)
    guardadas.push({ teoriaId: data.id, teoria, cruce })
  }
  for (const d of descartadas) {
    const cruce = elegidos.get(d.cruceId)
    if (!cruce) continue
    const { error } = await db.from("teorias").insert({
      origen: "motor",
      semana,
      estado: "descartada_por_motor",
      motivo_fallo: d.razon,
      temas: cruce.temas.map((t) => t.tema_id),
      puntaje: cruce.puntaje,
      componentes: cruce.componentes,
    })
    if (error) throw falloDeBase("No pude guardar la teoría descartada", error)
  }
  return guardadas
}

async function guardarIdeas(
  db: Db,
  semana: string,
  guardadas: readonly { teoriaId: string; teoria: TeoriaDelMotor; cruce: CruceElegido }[],
  nombreDeAutor: ReadonlyMap<string, { autor: string; cita: string }>,
): Promise<number> {
  const { data: ajustes, error: errorAjustes } = await db.from("ajustes").select("ideas_por_semana").single()
  if (errorAjustes) throw falloDeBase("No pude leer los ajustes", errorAjustes)
  const { data: ultima, error: errorNumero } = await db
    .from("ideas")
    .select("numero")
    .not("numero", "is", null)
    .order("numero", { ascending: false })
    .limit(1)
  if (errorNumero) throw falloDeBase("No pude leer el número de la última idea", errorNumero)
  let numero = ultima[0]?.numero ?? 0

  const ordenadas = [...guardadas].sort((x, y) => y.cruce.puntaje - x.cruce.puntaje)
  const filas = ordenadas.flatMap(({ teoriaId, teoria, cruce }) =>
    teoria.ideas.map((idea) => ({ teoriaId, teoria, cruce, idea })),
  )
  let insertadas = 0
  for (const { teoriaId, teoria, cruce, idea } of filas.slice(0, ajustes.ideas_por_semana)) {
    numero += 1
    const fuentes = teoria.aportes.flatMap((a) => {
      const origen = nombreDeAutor.get(a.afirmacionId)
      return origen ? [{ autor: origen.autor, cita: origen.cita, tema: idea.tema }] : []
    })
    const { error } = await db.from("ideas").insert({
      numero,
      origen: "motor",
      teoria_id: teoriaId,
      semana,
      estado: "idea",
      pilar: idea.pilar,
      gancho: idea.gancho,
      tema: idea.tema,
      formato: idea.formato,
      fuerza: fuerzaDe(cruce.puntaje),
      alertas: teoria.nivelEvidencia === "debil" ? [{ tipo: "respaldo", texto: "respaldo débil" }] : [],
      fuentes,
    })
    if (error) throw falloDeBase("No pude guardar la idea", error)
    insertadas += 1
  }
  return insertadas
}

async function terminar(
  db: Db,
  semana: string,
  cambios: Database["public"]["Tables"]["motor_corridas"]["Update"],
  ahora: string,
): Promise<void> {
  const { error } = await db
    .from("motor_corridas")
    .update({ ...cambios, terminada_en: ahora })
    .eq("semana", semana)
  if (error) throw falloDeBase("No pude cerrar la corrida del motor", error)
}

type Trabajo =
  | { resultado: "fallida"; motivo: string }
  | { resultado: "lista"; resumen: ResumenDeCorrida; costo: number }

async function trabajar(deps: DepsDelMotor, semana: string): Promise<Trabajo> {
  const { db } = deps
  const datos = await leerDatosDelMotor(db, { hoy: semana })
  const queSubir = reporteQueSubir(datos.temas)
  const { cruces, arranqueEnFrio } = elegir(datos)
  const resumenBase = {
    cruces: cruces.map((c) => ({
      ids: c.temas.map((t) => t.tema_id),
      nombres: c.temas.map((t) => t.nombre),
      puntaje: c.puntaje,
    })),
    queSubir,
  }
  const vacio = (archivadas: number): ResumenDeCorrida => ({
    ...resumenBase,
    teorias: 0,
    descartadas: [],
    ideas: 0,
    archivadas,
  })

  const paraClaude: CruceParaTeoria[] = []
  for (const cruce of cruces) {
    const afirmaciones = (await Promise.all(cruce.temas.map((t) => afirmacionesDe(db, t.tema_id)))).flat()
    if (afirmaciones.length === 0) continue
    paraClaude.push({
      id: cruce.id,
      ...(arranqueEnFrio && cruce.temas.length === 1 ? { minimoAutores: 1 } : {}),
      temas: cruce.temas.map((t) => ({ id: t.tema_id, nombre: t.nombre, pilar: t.pilar ?? "general" })),
      afirmaciones: afirmaciones.map((a) => ({ ...a })),
    })
  }
  if (paraClaude.length === 0) {
    const archivadas = await archivar(db)
    return { resultado: "lista", resumen: vacio(archivadas), costo: 0 }
  }

  const contexto = await contextoEditorial(db)
  const pagado = await pagarPaso(
    {
      db,
      almacen: deps.almacen,
      ahora: deps.ahora,
      clave: () => `motor:${semana}:${crypto.randomUUID()}`,
      verificar: () => Promise.resolve(),
    },
    {
      proveedor: "anthropic",
      paso: "motor",
      estimadoUsd: estimarEscritura(paraClaude, contexto),
      llamar: async () => {
        const r = await escribirTeorias({ cliente: deps.claude, cruces: paraClaude, contexto })
        return { datos: r, realUsd: costoClaude(r.uso, MODELO_POR_TAREA.escribirTeorias.modelo) }
      },
    },
  )
  if (pagado.tope) return { resultado: "fallida", motivo: MOTIVO_TOPE }
  const { teorias, descartadas, uso } = pagado.datos

  const elegidos = new Map(cruces.map((c) => [c.id, c]))
  const guardadas = await guardarTeorias(db, semana, elegidos, teorias, descartadas)
  const origenes = new Map(
    paraClaude.flatMap((c) => c.afirmaciones.map((a) => [a.id, { autor: a.autor, cita: a.cita }] as const)),
  )
  const ideas = await guardarIdeas(db, semana, guardadas, origenes)
  const archivadas = await archivar(db)
  return {
    resultado: "lista",
    costo: redondear(costoClaude(uso, MODELO_POR_TAREA.escribirTeorias.modelo)),
    resumen: { ...resumenBase, teorias: guardadas.length, descartadas, ideas, archivadas },
  }
}

async function archivar(db: Db): Promise<number> {
  const { data, error } = await db.rpc("archivar_ideas_del_motor", { p_semanas: SEMANAS_PARA_ARCHIVAR })
  if (error) throw falloDeBase("No pude archivar las ideas viejas", error)
  return data
}

/**
 * The Sunday run: scores crossings, asks Claude for theories and ideas, validates the backing and fills the bank.
 * One run per week (`motor_corridas.semana` is unique). Reaching the cap closes the run as failed without throwing;
 * any other error closes it as failed and propagates so the scheduled task alerts WAV.
 */
export async function correrMotor(
  deps: DepsDelMotor,
  entrada: { semana: string; manual: boolean },
): Promise<ResultadoDelMotor> {
  const { db } = deps
  const { semana, manual } = entrada
  const { error } = await db.from("motor_corridas").insert({ semana, estado: "corriendo" })
  if (error?.code === UNIQUE_VIOLATION) return { resultado: "ya_corrio" }
  if (error) throw falloDeBase("No pude registrar la corrida del motor", error)

  try {
    const r = await trabajar(deps, semana)
    if (r.resultado === "fallida") {
      await terminar(db, semana, { estado: "fallida", motivo_fallo: r.motivo }, deps.ahora())
      return { resultado: "fallida", motivo: r.motivo }
    }
    await terminar(db, semana, { estado: "lista", resumen: { ...r.resumen, manual }, costo_usd: r.costo }, deps.ahora())
    return { resultado: "lista", resumen: r.resumen }
  } catch (causa) {
    await terminar(db, semana, { estado: "fallida", motivo_fallo: MOTIVO_DE_FALLA }, deps.ahora())
    throw causa
  }
}
