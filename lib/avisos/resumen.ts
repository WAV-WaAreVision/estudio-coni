import type { SupabaseClient } from "@supabase/supabase-js"
import { diaLocal } from "@/lib/dominio/fechas"
import type { Notificador, ResumenDelDia } from "@/lib/proveedores/avisos"
import type { Database } from "@/lib/supabase/database.types"
import { type FilaDeAviso, leerPendientes, marcarEnviados, registrarAviso } from "./registro"
import { type CanalDeAviso, mensajePush } from "./tipos"

type Db = SupabaseClient<Database>

export interface DepsResumen {
  /** A `service_role` client. */
  db: Db
  /** What carries the summary (push with email as the fallback): not the notifier that stores notices. */
  canal: Notificador
  ahora: () => string
}

export type ResultadoResumen = { enviado: false } | { enviado: true; avisos: number; canal: CanalDeAviso }

const HORA_MS = 3_600_000
/** Design "Avisos a Coni": something that waits for her firm for more than this gets one reminder. */
const ESPERA_PARA_RECORDAR_MS = 48 * HORA_MS
/** A notice that missed its summary for this long is not news any more: it stays in the app and is not sent. */
const VIGENCIA_DEL_PENDIENTE_MS = 7 * 24 * HORA_MS
const ZONA_POR_DEFECTO = "America/Santiago"

function fallo(que: string, error: { message: string }): Error {
  return new Error(`No pude ${que}: ${error.message}`, { cause: error })
}

async function leerAjustesDelResumen(db: Db): Promise<{ zona: string; resumenActivado: boolean }> {
  const { data, error } = await db.from("ajustes").select("zona, avisos_resumen").maybeSingle()
  if (error) throw fallo("leer los ajustes del resumen", error)
  return { zona: data?.zona ?? ZONA_POR_DEFECTO, resumenActivado: data?.avisos_resumen ?? true }
}

/** Monday in Coni's zone is when the week's ideas are ready (design: "El lunes a las 8:00 te propongo 5 ideas nuevas"). */
async function anunciarIdeasDelLunes(deps: DepsResumen, zona: string): Promise<void> {
  const dia = diaLocal(Date.parse(deps.ahora()), zona)
  if (new Date(`${dia}T00:00:00Z`).getUTCDay() !== 1) return
  const { count, error } = await deps.db.from("ideas").select("id", { count: "exact", head: true }).eq("estado", "idea")
  if (error) throw fallo("contar las ideas del banco", error)
  if (!count) return
  await registrarAviso(
    deps.db,
    { tipo: "ideas_propuestas", clave: `ideas_propuestas:${dia}` },
    "Ya tienes ideas nuevas para elegir esta semana.",
  )
}

const ESPERANDO: Record<string, { tipo: "guion_listo" | "video_listo"; que: string }> = {
  guion_por_aprobar: { tipo: "guion_listo", que: "guion" },
  video_por_aprobar: { tipo: "video_listo", que: "video" },
}

/**
 * One reminder per piece, ever: a piece whose latest "ready for you" notice is older than 48 hours and that still
 * waits in that same state. The notice is the clock because it is written when the piece enters the state, while
 * `piezas.actualizada_en` moves with any save.
 */
async function recordarEsperas(deps: DepsResumen): Promise<void> {
  const { db } = deps
  const { data: piezas, error } = await db
    .from("piezas")
    .select("id, titulo, estado, tipo")
    .in("estado", ["guion_por_aprobar", "video_por_aprobar"])
  if (error) throw fallo("leer las piezas que esperan a Coni", error)
  if (piezas.length === 0) return
  const { data: listos, error: errorDeAvisos } = await db
    .from("avisos")
    .select("pieza_id, tipo, creado_en")
    .in(
      "pieza_id",
      piezas.map((pieza) => pieza.id),
    )
    .in("tipo", ["guion_listo", "video_listo"])
    .order("creado_en", { ascending: false })
  if (errorDeAvisos) throw fallo("leer los avisos de las piezas", errorDeAvisos)

  const limite = Date.parse(deps.ahora()) - ESPERA_PARA_RECORDAR_MS
  for (const pieza of piezas) {
    const esperando = ESPERANDO[pieza.estado]
    const ultimo = listos.find((aviso) => aviso.pieza_id === pieza.id)
    if (!esperando || !ultimo || ultimo.tipo !== esperando.tipo) continue
    if (Date.parse(ultimo.creado_en) > limite) continue
    await registrarAviso(
      db,
      { tipo: "recordatorio_48h", clave: `recordatorio_48h:${pieza.id}`, piezaId: pieza.id },
      `Tu ${pieza.tipo === "carrusel" ? "carrusel" : esperando.que} «${pieza.titulo}» espera tu firma desde hace más de 48 horas.`,
    )
  }
}

function componer(avisos: readonly FilaDeAviso[]): ResumenDelDia {
  const [unico] = avisos
  const cuerpoPush = unico && avisos.length === 1 ? mensajePush(unico).cuerpo : `Tienes ${avisos.length} avisos nuevos`
  const lineas = avisos.map((aviso) => `- ${aviso.mensaje}`)
  return {
    cuerpoPush,
    texto: ["Hola, Coni. Esto es lo nuevo en tu estudio:", "", ...lineas, "", "Entra a la app para verlo."].join("\n"),
  }
}

/**
 * The 08:30 summary (design A9): at most one a day, and none when nothing is new. First it writes the notices that are
 * not born from a state change (the week's ideas on Monday, the reminders), then it sends every notice still unsent as
 * one message and marks them (Ajustes can turn the summary off, and a notice a week old is left out). If the sending fails nothing is marked, and tomorrow's summary carries them.
 */
export async function enviarResumenDelDia(deps: DepsResumen): Promise<ResultadoResumen> {
  const { zona, resumenActivado } = await leerAjustesDelResumen(deps.db)
  // The notices are written either way (the app lists them); the switch of Ajustes only decides whether they are sent.
  await anunciarIdeasDelLunes(deps, zona)
  await recordarEsperas(deps)
  if (!resumenActivado) return { enviado: false }
  const desde = new Date(Date.parse(deps.ahora()) - VIGENCIA_DEL_PENDIENTE_MS).toISOString()
  const pendientes = await leerPendientes(deps.db, desde)
  if (pendientes.length === 0) return { enviado: false }
  const canal = await deps.canal.resumenAConi(componer(pendientes))
  await marcarEnviados(
    deps.db,
    pendientes.map((aviso) => aviso.id),
    canal,
    deps.ahora(),
  )
  return { enviado: true, avisos: pendientes.length, canal }
}
