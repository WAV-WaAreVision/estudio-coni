import type Anthropic from "@anthropic-ai/sdk"
import type { SupabaseClient } from "@supabase/supabase-js"
import { pilaresActivos } from "@/lib/datos/pilares"
import { leerGuiaVigente } from "@/lib/datos/repositorio"
import { falloDeBase, pagarPaso, redondear } from "@/lib/ingesta/gasto-material"
import { type DatosDelMotor, leerDatosDelMotor, type TemaDelMotor } from "@/lib/motor/datos"
import {
  CRUCES_POR_SEMANA,
  elegirCruces,
  elegirTemasSolos,
  MINIMO_CRUCES_PARA_NO_ARRANQUE_EN_FRIO,
  puntuarTemaSolo,
  reporteQueSubir,
} from "@/lib/motor/puntaje"
import { leerInterruptores } from "@/lib/presupuesto/interruptores"
import { avisarLimite, TEXTO_LIMITE } from "@/lib/presupuesto/limite"
import { detalleTecnico } from "@/lib/produccion/fallas"
import type { Almacen } from "@/lib/proveedores/almacen"
import {
  type CruceParaTeoria,
  costoClaude,
  escribirTeorias,
  MODELO_POR_TAREA,
  type TeoriaDelMotor,
} from "@/lib/proveedores/anthropic"
import type { Notificador } from "@/lib/proveedores/avisos"
import type { Database, Json } from "@/lib/supabase/database.types"

type Db = SupabaseClient<Database>

export interface DepsDelMotor {
  db: Db
  claude: Anthropic
  almacen: Almacen
  avisos: Notificador
  ahora: () => string
}

export type ResultadoDelMotor =
  | { resultado: "apagado" }
  | { resultado: "ya_corrio" }
  | { resultado: "fallida"; motivo: string }
  | { resultado: "lista"; resumen: ResumenDeCorrida }

type ResumenDeCorrida = {
  cruces: { ids: string[]; nombres: string[]; puntaje: number }[]
  teorias: number
  descartadas: { cruceId: string; razon: string }[]
  /** Batches Claude did not answer, with the error for WAV; their crossings are in `descartadas`. */
  lotesFallidos: { cruces: string[]; error: string }[]
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
/** One non-streaming Opus call writes about 1.5k tokens per crossing: three keep a call well under its timeout. */
export const CRUCES_POR_LLAMADA = 3
const RAZON_DE_LOTE_FALLIDO = "no alcancé a escribirla"
const MINUTOS_PARA_RETOMAR = 30
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
    pilares: await pilaresActivos(db),
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
  nombreDeAutor: ReadonlyMap<string, { autor: string; cita: string; tema: string }>,
): Promise<number> {
  const { data: ajustes, error: errorAjustes } = await db.from("ajustes").select("ideas_por_semana").single()
  if (errorAjustes) throw falloDeBase("No pude leer los ajustes", errorAjustes)
  const ordenadas = [...guardadas].sort((x, y) => y.cruce.puntaje - x.cruce.puntaje)
  const filas = ordenadas.flatMap(({ teoriaId, teoria, cruce }) =>
    teoria.ideas.map((idea) => ({ teoriaId, teoria, cruce, idea })),
  )
  let insertadas = 0
  for (const { teoriaId, teoria, cruce, idea } of filas.slice(0, ajustes.ideas_por_semana)) {
    const fuentes = teoria.aportes.flatMap((a) => {
      const origen = nombreDeAutor.get(a.afirmacionId)
      return origen ? [{ autor: origen.autor, cita: origen.cita, tema: origen.tema }] : []
    })
    // No `numero`: it belongs to the imported bank and a counter here would collide with the importer.
    const { error } = await db.from("ideas").insert({
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

type ContextoEditorial = Awaited<ReturnType<typeof contextoEditorial>>

type Escritura =
  | { resultado: "tope" }
  | {
      resultado: "escrita"
      teorias: TeoriaDelMotor[]
      descartadas: { cruceId: string; razon: string }[]
      lotesFallidos: { cruces: string[]; error: string }[]
      costo: number
    }

/**
 * Asks Claude for the theories in batches of `CRUCES_POR_LLAMADA`, each its own paid step so one call never carries
 * the whole week. A batch that fails (or hits the cap) after others worked costs only its own crossings: they come
 * back as discarded and the rest is kept. The run only fails when no batch worked: the cap if that was the reason,
 * else the first error, which propagates so Trigger.dev and WAV see it.
 */
async function escribirPorLotes(
  deps: DepsDelMotor,
  semana: string,
  cruces: readonly CruceParaTeoria[],
  contexto: ContextoEditorial,
): Promise<Escritura> {
  const { db } = deps
  const teorias: TeoriaDelMotor[] = []
  const descartadas: { cruceId: string; razon: string }[] = []
  const lotesFallidos: { cruces: string[]; error: string }[] = []
  let costo = 0
  let escritos = 0
  let primerError: unknown

  for (let desde = 0; desde < cruces.length; desde += CRUCES_POR_LLAMADA) {
    const lote = cruces.slice(desde, desde + CRUCES_POR_LLAMADA)
    const ids = lote.map((c) => c.id)
    try {
      const pagado = await pagarPaso(
        {
          db,
          almacen: deps.almacen,
          ahora: deps.ahora,
          clave: () => `motor:${semana}:${desde / CRUCES_POR_LLAMADA + 1}:${crypto.randomUUID()}`,
          verificar: () => Promise.resolve(),
        },
        {
          proveedor: "anthropic",
          paso: "motor",
          estimadoUsd: estimarEscritura(lote, contexto),
          llamar: async () => {
            const r = await escribirTeorias({ cliente: deps.claude, cruces: lote, contexto })
            return { datos: r, realUsd: costoClaude(r.uso, MODELO_POR_TAREA.escribirTeorias.modelo) }
          },
        },
      )
      if (pagado.tope) {
        lotesFallidos.push({ cruces: ids, error: TEXTO_LIMITE })
        descartadas.push(...ids.map((cruceId) => ({ cruceId, razon: RAZON_DE_LOTE_FALLIDO })))
        continue
      }
      teorias.push(...pagado.datos.teorias)
      descartadas.push(...pagado.datos.descartadas)
      costo += costoClaude(pagado.datos.uso, MODELO_POR_TAREA.escribirTeorias.modelo)
      escritos += 1
    } catch (error) {
      if (!(error instanceof Error)) throw error
      primerError ??= error
      lotesFallidos.push({ cruces: ids, error: detalleTecnico(error) })
      descartadas.push(...ids.map((cruceId) => ({ cruceId, razon: RAZON_DE_LOTE_FALLIDO })))
    }
  }

  if (escritos === 0) {
    if (primerError) throw primerError
    return { resultado: "tope" }
  }
  return { resultado: "escrita", teorias, descartadas, lotesFallidos, costo: redondear(costo) }
}

type Trabajo =
  | { resultado: "fallida"; motivo: string }
  | { resultado: "lista"; resumen: ResumenDeCorrida; costo: number }

async function trabajar(deps: DepsDelMotor, semana: string): Promise<Trabajo> {
  const { db } = deps
  const datos = await leerDatosDelMotor(db, { hoy: semana })
  const queSubir = reporteQueSubir(datos.temas, await pilaresActivos(db))
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
    lotesFallidos: [],
    ideas: 0,
    archivadas,
  })

  const paraClaude: CruceParaTeoria[] = []
  const origenes = new Map<string, { autor: string; cita: string; tema: string }>()
  for (const cruce of cruces) {
    const porTema = await Promise.all(cruce.temas.map((t) => afirmacionesDe(db, t.tema_id)))
    cruce.temas.forEach((t, i) => {
      for (const a of porTema[i] ?? []) origenes.set(a.id, { autor: a.autor, cita: a.cita, tema: t.nombre })
    })
    const afirmaciones = porTema.flat()
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
  const escritura = await escribirPorLotes(deps, semana, paraClaude, contexto)
  if (escritura.resultado === "tope") return { resultado: "fallida", motivo: TEXTO_LIMITE }
  const { teorias, descartadas, lotesFallidos, costo } = escritura

  const elegidos = new Map(cruces.map((c) => [c.id, c]))
  const guardadas = await guardarTeorias(db, semana, elegidos, teorias, descartadas)
  const ideas = await guardarIdeas(db, semana, guardadas, origenes)
  const archivadas = await archivar(db)
  return {
    resultado: "lista",
    costo,
    resumen: { ...resumenBase, teorias: guardadas.length, descartadas, lotesFallidos, ideas, archivadas },
  }
}

async function archivar(db: Db): Promise<number> {
  const { data, error } = await db.rpc("archivar_ideas_del_motor", { p_semanas: SEMANAS_PARA_ARCHIVAR })
  if (error) throw falloDeBase("No pude archivar las ideas viejas", error)
  return data
}

/**
 * Takes over the week's row when its run failed, or when it has been `corriendo` longer than a run can last (the task
 * crashed). The conditional update is the claim: only one caller gets the row. What the dead attempt left (it can
 * fail after inserting theories or ideas) is removed so the retry does not duplicate it.
 */
async function retomar(deps: DepsDelMotor, semana: string): Promise<boolean> {
  const { db } = deps
  const limite = new Date(Date.parse(deps.ahora()) - MINUTOS_PARA_RETOMAR * 60_000).toISOString()
  const { data, error } = await db
    .from("motor_corridas")
    .update({ estado: "corriendo", motivo_fallo: null, creada_en: deps.ahora(), terminada_en: null })
    .eq("semana", semana)
    .or(`estado.eq.fallida,and(estado.eq.corriendo,creada_en.lt.${limite})`)
    .select("id")
  if (error) throw falloDeBase("No pude retomar la corrida del motor", error)
  if (data.length === 0) return false
  const ideas = await db
    .from("ideas")
    .delete()
    .eq("origen", "motor")
    .eq("semana", semana)
    .eq("estado", "idea")
    .is("fijada_en", null)
  if (ideas.error) throw falloDeBase("No pude limpiar las ideas del intento anterior", ideas.error)
  const { data: conIdeas, error: errorConIdeas } = await db
    .from("ideas")
    .select("teoria_id")
    .eq("origen", "motor")
    .eq("semana", semana)
    .not("teoria_id", "is", null)
  if (errorConIdeas) throw falloDeBase("No pude leer las ideas del intento anterior", errorConIdeas)
  const conservar = new Set(conIdeas.map((i) => i.teoria_id))
  const { data: teorias, error: errorTeorias } = await db
    .from("teorias")
    .select("id")
    .eq("origen", "motor")
    .eq("semana", semana)
  if (errorTeorias) throw falloDeBase("No pude leer las teorías del intento anterior", errorTeorias)
  const borrar = teorias.map((t) => t.id).filter((id) => !conservar.has(id))
  if (borrar.length > 0) {
    const r = await db.from("teorias").delete().in("id", borrar)
    if (r.error) throw falloDeBase("No pude limpiar las teorías del intento anterior", r.error)
  }
  return true
}

/** A run the month's limit stopped, whole or in part: Coni hears it once a month (spec 2026-11-02). */
function llegoAlLimite(trabajo: Trabajo): boolean {
  if (trabajo.resultado === "fallida") return trabajo.motivo === TEXTO_LIMITE
  return trabajo.resumen.lotesFallidos.some((lote) => lote.error === TEXTO_LIMITE)
}

/** Works the week and closes its run either way: failed with the Spanish motive, or ready with its summary. */
async function trabajarYCerrar(deps: DepsDelMotor, semana: string, manual: boolean): Promise<Trabajo> {
  const { db } = deps
  try {
    const r = await trabajar(deps, semana)
    if (r.resultado === "fallida") {
      await terminar(db, semana, { estado: "fallida", motivo_fallo: r.motivo }, deps.ahora())
    } else {
      await terminar(
        db,
        semana,
        { estado: "lista", resumen: { ...r.resumen, manual }, costo_usd: r.costo },
        deps.ahora(),
      )
    }
    return r
  } catch (causa) {
    await terminar(db, semana, { estado: "fallida", motivo_fallo: MOTIVO_DE_FALLA }, deps.ahora())
    throw causa
  }
}

const esObjeto = (valor: Json | undefined): valor is { [clave: string]: Json | undefined } =>
  typeof valor === "object" && valor !== null && !Array.isArray(valor)

/** A closed run's summary with a batch the limit stopped: the notice of that run may not have gone out. */
function resumenLlegoAlLimite(resumen: Json | null): boolean {
  const valor = resumen ?? undefined
  if (!esObjeto(valor)) return false
  const lotes = valor.lotesFallidos
  return Array.isArray(lotes) && lotes.some((lote) => esObjeto(lote) && lote.error === TEXTO_LIMITE)
}

/**
 * The week already ran. If the limit stopped part of it, the notice of that run may have failed after the run was
 * closed (a retry lands here): it goes again, deduped by its monthly key, dated by the run so a retry past midnight
 * at the end of the month keeps the run's month.
 */
async function avisarLimiteDeUnaCorridaCerrada(deps: DepsDelMotor, semana: string): Promise<void> {
  const { data, error } = await deps.db
    .from("motor_corridas")
    .select("resumen, terminada_en")
    .eq("semana", semana)
    .maybeSingle()
  if (error) throw falloDeBase("No pude leer la corrida del motor", error)
  if (data?.terminada_en && resumenLlegoAlLimite(data.resumen)) await avisarLimite(deps, data.terminada_en)
}

/**
 * The Sunday run: scores crossings, asks Claude for theories and ideas, validates the backing and fills the bank.
 * One run per week (`motor_corridas.semana` is unique). Turned off in Ajustes › Presupuesto, the Sunday run is skipped
 * before it registers anything; «Proponer ahora» (manual) is Coni asking and always runs. Reaching the limit closes the
 * run as failed without throwing and tells Coni, also when it stopped only some batches; a notice that fails
 * propagates (the task alerts WAV) and the retry sends it again. Any other error closes the run as failed and
 * propagates so the scheduled task alerts WAV.
 */
export async function correrMotor(
  deps: DepsDelMotor,
  entrada: { semana: string; manual: boolean },
): Promise<ResultadoDelMotor> {
  const { db } = deps
  const { semana, manual } = entrada
  if (!manual && !(await leerInterruptores(db)).motorSemanal) return { resultado: "apagado" }
  const { error } = await db.from("motor_corridas").insert({ semana, estado: "corriendo" })
  if (error?.code === UNIQUE_VIOLATION) {
    if (!(await retomar(deps, semana))) {
      await avisarLimiteDeUnaCorridaCerrada(deps, semana)
      return { resultado: "ya_corrio" }
    }
  } else if (error) throw falloDeBase("No pude registrar la corrida del motor", error)

  const r = await trabajarYCerrar(deps, semana, manual)
  // After the run is closed, so a failed notice never makes a retry redo the run and drop its paid ideas: a failed
  // run is taken over by `retomar` and notices again; a ready one answers `ya_corrio` and notices from its summary.
  if (llegoAlLimite(r)) await avisarLimite(deps, deps.ahora())
  return r.resultado === "fallida"
    ? { resultado: "fallida", motivo: r.motivo }
    : { resultado: "lista", resumen: r.resumen }
}
