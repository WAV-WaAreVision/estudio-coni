import type { SupabaseClient } from "@supabase/supabase-js"
import { leerAvataresElegibles } from "@/lib/datos/pantallas"
import { cambiosDesdePieza, piezaDesdeFila } from "@/lib/datos/piezas"
import {
  actualizarPieza,
  type CambiosDePieza,
  type FilaDePieza,
  leerIdea,
  leerPieza,
  revisionAJson,
} from "@/lib/datos/repositorio"
import { leerRespaldo } from "@/lib/datos/respaldo"
import { esJuicioDeClaude, leerRevision } from "@/lib/datos/revision"
import { enlaceDeInstagram } from "@/lib/dominio/enlace-instagram"
import { ArtefactoCambio, type Evento, instanteEstricto, TransicionInvalida, transicionar } from "@/lib/dominio/estados"
import { Falla } from "@/lib/dominio/falla"
import { MAXIMO_DE_IDEAS } from "@/lib/dominio/ideas"
import { hashPuerta1, hashTexto } from "@/lib/dominio/puertas"
import { ajenoDelRespaldo, huellaDeRespaldo } from "@/lib/dominio/respaldo"
import { type Hallazgo, pideLineasDeAyuda, revisarGuion } from "@/lib/dominio/revision"
import type { Database } from "@/lib/supabase/database.types"
import { claveGrabar, claveProducir, type Disparos } from "./disparos"
import { aResultado, type Resultado } from "./resultado"

type Db = SupabaseClient<Database>

export interface DepsAcciones {
  /** Coni's session client: the database records who approved from it, and row level security applies. */
  db: Db
  disparar: Disparos
  ahora: () => string
}

// Instagram's limit for a caption.
export const MAXIMO_DEL_TEXTO = 2200

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

/** The avatar she signs with the script: it has to be one of the looks WAV lets her choose right now. */
async function exigirAvatarElegible(db: Db, avatarId: string | null): Promise<string> {
  const elegibles = await leerAvataresElegibles(db)
  if (elegibles.length === 0) throw new Falla("Todavía no hay avatares para elegir: avísale a Federico.")
  const elegido = avatarId?.trim()
  if (!elegido) throw new Falla("Elige con qué avatar se graba antes de aprobar.")
  if (!elegibles.some((avatar) => avatar.avatar_id === elegido)) {
    throw new Falla("Ese avatar ya no está disponible. Elige otro.")
  }
  return elegido
}

/**
 * Gate 1 approves the script, the publication text, the avatar and the frozen backing in one write (formula 3: the
 * voice is made after it): the avatar and the formula go in the same update as the approval, so the hash is the hash of exactly what she
 * saw and the audit row carries them. Nothing is spent and nothing starts here.
 */
export function aprobarGuion(deps: DepsAcciones, piezaId: string, versionVista: number, avatarId: string | null) {
  return aResultado("aprobarGuion", async () => {
    const fila = await leerObligatoria(deps.db, piezaId)
    exigirVersion(fila, versionVista, new ArtefactoCambio())
    // `versionVista` is the version of the screen she signed, and the write below only matches that version, so the
    // hash recomputed from this row is the hash of exactly what she saw.
    if (fila.estado !== "guion_por_aprobar") throw new TransicionInvalida(fila.estado, "aprobar_guion")
    if (fila.guion === null || fila.texto === null) {
      throw new Error(`La pieza ${fila.id} está por aprobar sin guion o sin texto.`)
    }
    exigirRevisionLimpia(fila)
    const avatar = await exigirAvatarElegible(deps.db, avatarId)
    const respaldo = huellaDeRespaldo(leerRespaldo(fila.respaldo))
    const hash = hashPuerta1({ formula: 3, guion: fila.guion, texto: fila.texto, avatarId: avatar, respaldo })
    await guardarEvento(
      deps.db,
      fila,
      { tipo: "aprobar_guion", actor: "coni", hashVisto: hash, hashActual: hash, en: deps.ahora() },
      { avatar_id: avatar, puerta1_formula: 3 },
    )
    // Approving spends nothing: Coni records the voice and the video from the same screen afterwards.
    return {}
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
    // The state change is validated here and applied by the function below, which repeats it in SQL.
    transicionar(piezaDesdeFila(fila), { tipo: "editar_texto" })

    const juicios = leerRevision(fila.revision).filter(esJuicioDeClaude)
    const idea = fila.idea_id ? await leerIdea(deps.db, fila.idea_id) : null
    const requiereLineasAyuda =
      pideLineasDeAyuda(idea?.alertas ?? []) || juicios.some((hallazgo) => hallazgo.regla === "tema_de_riesgo")
    const respaldo = leerRespaldo(fila.respaldo)
    const revision: Hallazgo[] = [
      ...revisarGuion({
        guion: fila.guion,
        texto,
        esAvatar: true,
        requiereLineasAyuda,
        ajeno: ajenoDelRespaldo(respaldo),
      }),
      ...juicios,
    ]

    // Written as Coni (the database function is hers alone), so the audit row names her and not the service role.
    const { error } = await deps.db.rpc("editar_texto_como_coni", {
      p_pieza: fila.id,
      p_version: fila.version,
      p_texto: texto,
      p_revision: revisionAJson(revision),
    })
    if (error) throw traducir(new Error(error.message, { cause: error }))
    return {}
  })
}

/** Two reels at the same minute would go out together: the slot has to be free. An unreadable time is the domain's to refuse. */
async function exigirHorarioLibre(db: Db, piezaId: string, publicarEn: string): Promise<void> {
  const instante = instanteEstricto(publicarEn)
  if (instante === null) return
  const { data, error } = await db
    .from("piezas")
    .select("id")
    .eq("estado", "programado")
    .eq("puerta2_publicar_en", instante)
    .neq("id", piezaId)
    .limit(1)
  if (error) throw new Error(`No pude revisar si el horario está libre: ${error.message}`, { cause: error })
  if (data.length > 0) throw new Falla("Ese horario ya lo tiene otro reel. Elige otro.")
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
    await exigirHorarioLibre(deps.db, fila.id, publicarEn)
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

/**
 * Instagram is not connected: Coni uploaded the reel herself and says so. It is written with her session, so the audit
 * row carries her name and the database refuses anybody else. The link is optional, checked as text and never fetched.
 */
export function marcarSubidoAMano(deps: DepsAcciones, piezaId: string, versionVista: number, enlace: string) {
  return aResultado("marcarSubidoAMano", async () => {
    const permalink = enlaceDeInstagram(enlace)
    const fila = await leerObligatoria(deps.db, piezaId)
    exigirVersion(fila, versionVista)
    await guardarEvento(deps.db, fila, { tipo: "subido_a_mano", actor: "coni" }, permalink ? { permalink } : {})
    return {}
  })
}

const TEXTO_SIN_DESCARGA = "No pude preparar el video para descargarlo. Inténtalo de nuevo en unos minutos."

/**
 * The signed address she downloads the approved video from. The file goes from R2 to her phone: nothing of it passes
 * through the server. `firmar` is the storage port with a short expiry and the name the file will have.
 */
export function pedirDescargaDelVideo(
  deps: DepsAcciones,
  piezaId: string,
  firmar: (clave: string, nombreDeArchivo: string) => Promise<string | null>,
) {
  return aResultado("pedirDescargaDelVideo", async () => {
    const { data: esConi, error } = await deps.db.rpc("es_coni")
    if (error) throw new Error(`No pude comprobar quién es: ${error.message}`, { cause: error })
    if (!esConi) throw new Falla("Esta app es solo para Coni.")
    const fila = await leerObligatoria(deps.db, piezaId)
    if (fila.estado !== "para_subir_a_mano" && fila.estado !== "programado") {
      throw new Falla("Este reel ya no está esperando que lo subas.")
    }
    // The video she approved, not whatever the piece points to now.
    const clave = fila.puerta2_video_id
    if (clave === null) throw new Error(`La pieza ${fila.id} espera subirse sin video aprobado.`)
    const url = await firmar(clave, `reel-${fila.id.slice(0, 8)}.mp4`)
    if (url === null) throw new Falla(TEXTO_SIN_DESCARGA)
    return { url }
  })
}
