import type { SupabaseClient } from "@supabase/supabase-js"
import { cambiosDesdePieza, piezaDesdeFila } from "@/lib/datos/piezas"
import {
  actualizarPieza,
  type CambiosDePieza,
  type FilaDePieza,
  leerIdea,
  leerPieza,
  revisionAJson,
} from "@/lib/datos/repositorio"
import { esJuicioDeClaude, leerRevision } from "@/lib/datos/revision"
import { ArtefactoCambio, type Evento, TransicionInvalida, transicionar } from "@/lib/dominio/estados"
import { Falla } from "@/lib/dominio/falla"
import { hashPuerta1, hashTexto } from "@/lib/dominio/puertas"
import { type Hallazgo, pideLineasDeAyuda, revisarGuion } from "@/lib/dominio/revision"
import type { Database } from "@/lib/supabase/database.types"
import { claveGrabar, claveProducir, type Disparos } from "./disparos"
import { aResultado, type Resultado } from "./resultado"

type Db = SupabaseClient<Database>

export interface DepsAcciones {
  /** Coni's session client: the database records who approved from it, and row level security applies. */
  db: Db
  /** A `service_role` client, asked for only by `editarTexto` (the review column is written by the server alone). */
  servicio: () => Db
  disparar: Disparos
  ahora: () => string
}

const MAXIMO_DE_IDEAS = 5
// Instagram's limit for a caption.
const MAXIMO_DEL_TEXTO = 2200

/** The screen she is looking at is not the piece any more (somebody, or a task, wrote to it meanwhile). */
class PantallaVencida extends Falla {
  constructor() {
    super("Esta pieza cambió mientras la mirabas. Vuelve a abrirla.")
    this.name = "PantallaVencida"
  }
}

async function leerObligatoria(db: Db, piezaId: string): Promise<FilaDePieza> {
  const fila = await leerPieza(db, piezaId)
  if (!fila) throw new Falla("No encuentro esa pieza.")
  return fila
}

function exigirVersion(fila: FilaDePieza, versionVista: number, error: Falla = new PantallaVencida()): void {
  if (fila.version !== versionVista) throw error
}

function exigirRevisionLimpia(fila: FilaDePieza): void {
  const bloqueante = leerRevision(fila.revision).find((hallazgo) => hallazgo.tipo === "bloquea")
  if (bloqueante) throw new Falla(`Todavía no puedes aprobar. ${bloqueante.mensaje}`)
}

function traducir(error: unknown): unknown {
  if (error instanceof Falla || !(error instanceof Error)) return error
  // The database enforces the same rules as the screen; these are the two a race can reach.
  if (error.message.includes("revision_bloquea")) {
    return new Falla("Todavía no puedes aprobar: la revisión tiene algo que corregir.")
  }
  if (error.message.includes("version_desfasada")) return new PantallaVencida()
  return error
}

/** The optimistic-lock write: null from the repository means the piece moved on since it was read. */
async function guardar(db: Db, fila: FilaDePieza, cambios: CambiosDePieza): Promise<FilaDePieza> {
  try {
    const guardada = await actualizarPieza(db, fila.id, fila.version, cambios)
    if (!guardada) throw new PantallaVencida()
    return guardada
  } catch (error) {
    throw traducir(error)
  }
}

async function guardarEvento(db: Db, fila: FilaDePieza, evento: Evento, extra: CambiosDePieza = {}) {
  const { pieza } = transicionar(piezaDesdeFila(fila), evento)
  return guardar(db, fila, { ...cambiosDesdePieza(pieza), ...extra })
}

/**
 * Starts a run after the piece was saved. The approval already stands, so a failure to start is logged and shown to
 * Coni as a warning rather than as a failed approval; `mantenimiento` hands a render that never started back to her.
 */
async function iniciar(
  nombre: string,
  arrancar: () => Promise<void>,
  aviso: string,
): Promise<{ advertencia?: string }> {
  try {
    await arrancar()
    return {}
  } catch (error) {
    console.error(`No pude iniciar ${nombre}`, error)
    return { advertencia: aviso }
  }
}

const AVISO_GRABACION = "Quedó aprobado, pero la grabación tarda en partir. Si no avanza, te aviso."

export function elegirIdeas(deps: DepsAcciones, ideaIds: readonly string[]): Promise<Resultado<{ piezas: string[] }>> {
  return aResultado("elegirIdeas", async () => {
    if (ideaIds.length === 0 || ideaIds.length > MAXIMO_DE_IDEAS || new Set(ideaIds).size !== ideaIds.length) {
      throw new Falla(`Elige entre una y ${MAXIMO_DE_IDEAS} ideas distintas.`)
    }
    const noDisponible = new Falla("Una de esas ideas ya no está disponible. Vuelve a elegir.")
    const { data: ideas, error } = await deps.db
      .from("ideas")
      .select("id, gancho, estado")
      .in("id", [...ideaIds])
    if (error) throw new Error(`No pude leer las ideas: ${error.message}`, { cause: error })
    if (ideas.length !== ideaIds.length || ideas.some((idea) => idea.estado !== "idea")) throw noDisponible

    const piezas: string[] = []
    for (const id of ideaIds) {
      const idea = ideas.find((candidata) => candidata.id === id)
      if (!idea) throw noDisponible
      piezas.push(await empezarPieza(deps, idea, noDisponible))
    }
    return { piezas }
  })
}

async function empezarPieza(deps: DepsAcciones, idea: { id: string; gancho: string }, noDisponible: Falla) {
  // The claim is atomic (`estado = 'idea'` in the update): a second tap or a second device finds it taken.
  const { data: reclamada, error } = await deps.db
    .from("ideas")
    .update({ estado: "usada" })
    .eq("id", idea.id)
    .eq("estado", "idea")
    .select("id")
    .maybeSingle()
  if (error) throw new Error(`No pude reservar la idea: ${error.message}`, { cause: error })
  if (!reclamada) throw noDisponible

  let nueva: FilaDePieza
  try {
    const creada = await deps.db.from("piezas").insert({ idea_id: idea.id, titulo: idea.gancho }).select().single()
    if (creada.error) throw new Error(`No pude crear la pieza: ${creada.error.message}`, { cause: creada.error })
    nueva = await guardarEvento(deps.db, creada.data, { tipo: "elegir" })
  } catch (error) {
    await liberarIdea(deps.db, idea.id)
    throw error
  }

  try {
    await deps.disparar.producir(nueva.id, claveProducir(nueva))
  } catch (error) {
    console.error("No pude iniciar producir-pieza", error)
    await explicarSinGuion(deps.db, nueva)
    throw new Falla("No pude empezar a escribir el guion. Inténtalo de nuevo en unos minutos.")
  }
  return nueva.id
}

async function liberarIdea(db: Db, ideaId: string): Promise<void> {
  const { error } = await db.from("ideas").update({ estado: "idea" }).eq("id", ideaId)
  if (error) console.error(`No pude devolver la idea ${ideaId} al banco`, error)
}

const EXPLICACION_SIN_GUION = "No pude empezar a escribir el guion. Inténtalo de nuevo."

async function explicarSinGuion(db: Db, fila: FilaDePieza): Promise<void> {
  const { error } = await db
    .from("piezas")
    .update({ version: fila.version + 1, explicacion: EXPLICACION_SIN_GUION })
    .eq("id", fila.id)
    .eq("version", fila.version)
  if (error) console.error(`No pude dejar la explicación en la pieza ${fila.id}`, error)
}

/** A piece left without a script (the cap, a refusal, or a run that never started): clears the reason and starts again. */
export function reintentarGuion(deps: DepsAcciones, piezaId: string, versionVista: number) {
  return aResultado("reintentarGuion", async () => {
    const fila = await leerObligatoria(deps.db, piezaId)
    exigirVersion(fila, versionVista)
    if (fila.estado !== "guion_en_proceso" || fila.explicacion === null) {
      throw new Falla("Esta pieza no está esperando que la reintentes.")
    }
    const guardada = await guardar(deps.db, fila, { version: fila.version + 1, explicacion: null })
    return iniciar(
      "producir-pieza",
      () => deps.disparar.producir(guardada.id, claveProducir(guardada)),
      "Lo intenté otra vez, pero el guion tarda en partir. Si no avanza, vuelve a intentarlo.",
    )
  })
}

export function aprobarGuion(deps: DepsAcciones, piezaId: string, versionVista: number) {
  return aResultado("aprobarGuion", async () => {
    const fila = await leerObligatoria(deps.db, piezaId)
    exigirVersion(fila, versionVista, new ArtefactoCambio())
    // `versionVista` is the version of the screen she signed, and the write below only matches that version, so the
    // hash recomputed from this row is the hash of exactly what she saw.
    if (fila.estado !== "guion_por_aprobar") throw new TransicionInvalida(fila.estado, "aprobar_guion")
    if (fila.guion === null || fila.audio_id === null) {
      throw new Error(`La pieza ${fila.id} está por aprobar sin guion o sin voz.`)
    }
    exigirRevisionLimpia(fila)
    const hash = hashPuerta1({ guion: fila.guion, audioId: fila.audio_id })
    const guardada = await guardarEvento(deps.db, fila, {
      tipo: "aprobar_guion",
      actor: "coni",
      hashVisto: hash,
      hashActual: hash,
      en: deps.ahora(),
    })
    return iniciar("grabar-pieza", () => deps.disparar.grabar(guardada.id, claveGrabar(guardada)), AVISO_GRABACION)
  })
}

export function pedirCambios(deps: DepsAcciones, piezaId: string, versionVista: number) {
  return aResultado("pedirCambios", async () => {
    const fila = await leerObligatoria(deps.db, piezaId)
    exigirVersion(fila, versionVista)
    const guardada = await guardarEvento(deps.db, fila, { tipo: "pedir_cambios" })
    return iniciar(
      "producir-pieza",
      () => deps.disparar.producir(guardada.id, claveProducir(guardada)),
      "Pedí los cambios, pero el nuevo guion tarda en partir. Si no avanza, vuelve a intentarlo.",
    )
  })
}

/** CRLF to LF and NFC, so the hash of a caption does not depend on the keyboard or the paste that produced it. */
export function normalizarTexto(texto: string): string {
  return texto.replace(/\r\n?/g, "\n").normalize("NFC").trim()
}

export function editarTexto(deps: DepsAcciones, piezaId: string, versionVista: number, textoNuevo: string) {
  return aResultado("editarTexto", async () => {
    const texto = normalizarTexto(textoNuevo)
    if (texto === "") throw new Falla("El texto no puede quedar vacío.")
    if ([...texto].length > MAXIMO_DEL_TEXTO) throw new Falla("Instagram acepta hasta 2.200 caracteres en el texto.")

    const fila = await leerObligatoria(deps.db, piezaId)
    exigirVersion(fila, versionVista)
    if (fila.guion === null) throw new Error(`La pieza ${fila.id} tiene texto por editar pero no guion.`)
    const { pieza } = transicionar(piezaDesdeFila(fila), { tipo: "editar_texto" })

    const juicios = leerRevision(fila.revision).filter(esJuicioDeClaude)
    const idea = fila.idea_id ? await leerIdea(deps.db, fila.idea_id) : null
    const requiereLineasAyuda =
      pideLineasDeAyuda(idea?.alertas ?? []) || juicios.some((hallazgo) => hallazgo.regla === "tema_de_riesgo")
    const revision: Hallazgo[] = [
      ...revisarGuion({ guion: fila.guion, texto, esAvatar: true, requiereLineasAyuda }),
      ...juicios,
    ]

    // Only the server writes `revision` (a trigger refuses Coni's session), so this one write uses the service role.
    // The version check still guards it, and the caption is hers: it was read through her own session above.
    await guardar(deps.servicio(), fila, { ...cambiosDesdePieza(pieza), texto, revision: revisionAJson(revision) })
    return {}
  })
}

export function aprobarVideo(deps: DepsAcciones, piezaId: string, versionVista: number, publicarEn: string) {
  return aResultado("aprobarVideo", async () => {
    const fila = await leerObligatoria(deps.db, piezaId)
    exigirVersion(fila, versionVista, new ArtefactoCambio())
    if (fila.estado !== "video_por_aprobar") throw new TransicionInvalida(fila.estado, "aprobar_video")
    if (fila.video_id === null || fila.texto === null) {
      throw new Error(`La pieza ${fila.id} está por aprobar sin video o sin texto.`)
    }
    exigirRevisionLimpia(fila)
    const hash = hashTexto(fila.texto)
    await guardarEvento(deps.db, fila, {
      tipo: "aprobar_video",
      actor: "coni",
      videoVisto: fila.video_id,
      hashTextoVisto: hash,
      hashTextoActual: hash,
      publicarEn,
      en: deps.ahora(),
    })
    // Nothing to start: `publicar-pendientes` takes the piece when its approved time arrives.
    return {}
  })
}

export function regrabar(deps: DepsAcciones, piezaId: string, versionVista: number) {
  return aResultado("regrabar", async () => {
    const fila = await leerObligatoria(deps.db, piezaId)
    exigirVersion(fila, versionVista)
    const guardada = await guardarEvento(deps.db, fila, { tipo: "regrabar" })
    return iniciar("grabar-pieza", () => deps.disparar.grabar(guardada.id, claveGrabar(guardada)), AVISO_GRABACION)
  })
}

/** Back to approval so she can choose another date. Publishing is our own task, so there is no remote post to cancel. */
export function cambiarFecha(deps: DepsAcciones, piezaId: string, versionVista: number) {
  return aResultado("cambiarFecha", async () => {
    const fila = await leerObligatoria(deps.db, piezaId)
    exigirVersion(fila, versionVista)
    await guardarEvento(deps.db, fila, { tipo: "cambiar_fecha" })
    return {}
  })
}

/** Discarding a scheduled piece needs no remote cancel either: the state change is what stops `publicar-pendientes`. */
export function descartar(deps: DepsAcciones, piezaId: string, versionVista: number) {
  return aResultado("descartar", async () => {
    const fila = await leerObligatoria(deps.db, piezaId)
    exigirVersion(fila, versionVista)
    await guardarEvento(deps.db, fila, { tipo: "descartar" })
    return {}
  })
}

export function reintentar(deps: DepsAcciones, piezaId: string, versionVista: number) {
  return aResultado("reintentar", async () => {
    const fila = await leerObligatoria(deps.db, piezaId)
    exigirVersion(fila, versionVista)
    const guardada = await guardarEvento(deps.db, fila, { tipo: "reintentar", ahora: deps.ahora() })
    // Back in the render steps a run has to start again; back on the schedule, the cron takes it at its time.
    if (guardada.estado !== "en_render" && guardada.estado !== "subtitulando") return {}
    return iniciar("grabar-pieza", () => deps.disparar.grabar(guardada.id, claveGrabar(guardada)), AVISO_GRABACION)
  })
}
