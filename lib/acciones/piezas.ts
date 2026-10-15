import type { SupabaseClient } from "@supabase/supabase-js"
import { leerAvataresElegibles, leerInstagramConectado } from "@/lib/datos/pantallas"
import { cambiosDesdePieza, piezaDesdeFila } from "@/lib/datos/piezas"
import {
  actualizarPieza,
  type CambiosDePieza,
  type FilaDePieza,
  leerIdea,
  leerPieza,
  leerPublicaciones,
  revisionAJson,
} from "@/lib/datos/repositorio"
import { leerRespaldo } from "@/lib/datos/respaldo"
import { esJuicioDeClaude, leerRevision } from "@/lib/datos/revision"
import { canonicos, destinosValidos, esDestino, resumenDePublicaciones } from "@/lib/dominio/destinos"
import { enlaceDeInstagram } from "@/lib/dominio/enlace-instagram"
import { enlaceDeLinkedIn } from "@/lib/dominio/enlace-linkedin"
import { ArtefactoCambio, type Evento, instanteEstricto, TransicionInvalida, transicionar } from "@/lib/dominio/estados"
import { Falla } from "@/lib/dominio/falla"
import { MAXIMO_DE_IDEAS } from "@/lib/dominio/ideas"
import { hashPuerta1, hashTextoDePuerta2 } from "@/lib/dominio/puertas"
import { ajenoDelRespaldo, huellaDeRespaldo } from "@/lib/dominio/respaldo"
import {
  type Hallazgo,
  hallazgosDeLaAprobacion,
  MAXIMO_TEXTO_LINKEDIN,
  pideLineasDeAyuda,
  revisarGuion,
  revisarLinkedinSiHay,
  sinLinkedin,
} from "@/lib/dominio/revision"
import type { Database } from "@/lib/supabase/database.types"
import { claveGrabar, claveProducir, claveVoz, type Disparos } from "./disparos"
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

/**
 * What blocks an approval. The findings of the LinkedIn text count only when that text is part of what is approved
 * (gate 2 with LinkedIn chosen): gate 1 is about the script and the caption.
 */
function exigirRevisionLimpia(fila: FilaDePieza, { linkedin }: { linkedin: boolean }): void {
  const bloqueante = hallazgosDeLaAprobacion(leerRevision(fila.revision), { linkedin }).find(
    (hallazgo) => hallazgo.tipo === "bloquea",
  )
  if (bloqueante) throw new Falla(`Todavía no puedes aprobar. ${bloqueante.mensaje}`)
}

const INSTAGRAM_SALE_SOLO = "Instagram está conectado: este reel sale solo a la hora aprobada."
const LINKEDIN_SALE_SOLO = "LinkedIn está conectado: este reel sale solo a la hora aprobada."
const LINKEDIN_EN_DUDA =
  "LinkedIn puede haber publicado este video. Espera mi aviso para revisarlo en tu perfil antes de subirlo."
const DESTINO_YA_NO_ESPERA = "Ese destino ya no está esperando que lo subas."

function traducir(error: unknown): unknown {
  if (error instanceof Falla || !(error instanceof Error)) return error
  // The database enforces the same rules as the screen; these are the two a race can reach.
  if (error.message.includes("revision_bloquea")) {
    return new Falla("Todavía no puedes aprobar: la revisión tiene algo que corregir.")
  }
  if (error.message.includes("version_desfasada")) return new PantallaVencida()
  // Two screens marked the same destination, or the piece left the upload steps: what she sees is out of date.
  if (error.message.includes("destino_no_pendiente")) return new Falla(DESTINO_YA_NO_ESPERA)
  if (error.message.includes("estado_no_marcable")) return new PantallaVencida()
  if (error.message.includes("instagram_se_publica_solo")) return new Falla(INSTAGRAM_SALE_SOLO)
  if (error.message.includes("linkedin_se_publica_solo")) return new Falla(LINKEDIN_SALE_SOLO)
  if (error.message.includes("linkedin_envio_en_duda")) return new Falla(LINKEDIN_EN_DUDA)
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
    exigirRevisionLimpia(fila, { linkedin: false })
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

const TEXTO_SIN_ARRANQUE_DE_VOZ = "No pude empezar a grabar la voz. Inténtalo de nuevo en unos minutos."

/** Her voice on the approved script. Nothing else would start this run, so a failure to start hands the piece back. */
export function pedirVoz(deps: DepsAcciones, piezaId: string, versionVista: number, nueva: boolean) {
  return aResultado("pedirVoz", async () => {
    const fila = await leerObligatoria(deps.db, piezaId)
    exigirVersion(fila, versionVista)
    const guardada = await guardarEvento(deps.db, fila, { tipo: "pedir_voz" })
    try {
      await deps.disparar.voz(guardada.id, claveVoz(guardada), nueva)
    } catch (error) {
      console.error("No pude iniciar grabar-voz", error)
      await guardarEvento(deps.db, guardada, { tipo: "falla_voz", explicacion: TEXTO_SIN_ARRANQUE_DE_VOZ })
      throw new Falla(TEXTO_SIN_ARRANQUE_DE_VOZ)
    }
    return {}
  })
}

/** The video of the approved script. A run that does not start is picked up by `reanudarArranques`. */
export function pedirVideo(deps: DepsAcciones, piezaId: string, versionVista: number) {
  return aResultado("pedirVideo", async () => {
    const fila = await leerObligatoria(deps.db, piezaId)
    exigirVersion(fila, versionVista)
    const guardada = await guardarEvento(deps.db, fila, { tipo: "grabar_video" })
    return iniciar(
      "grabar-pieza",
      () => deps.disparar.grabar(guardada.id, claveGrabar(guardada), guardada.intento),
      AVISO_GRABACION,
    )
  })
}

/** Takes gate 1 back so she can change the script, the caption or the avatar. */
export function reabrirGuion(deps: DepsAcciones, piezaId: string, versionVista: number) {
  return aResultado("reabrirGuion", async () => {
    const fila = await leerObligatoria(deps.db, piezaId)
    exigirVersion(fila, versionVista)
    await guardarEvento(deps.db, fila, { tipo: "reabrir_guion" })
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

/** The idea alerts or Claude's own judgment of the topic say the help lines of Chile go in the texts. */
async function pideAyuda(db: Db, fila: FilaDePieza, juicios: readonly Hallazgo[]): Promise<boolean> {
  const idea = fila.idea_id ? await leerIdea(db, fila.idea_id) : null
  return pideLineasDeAyuda(idea?.alertas ?? []) || juicios.some((hallazgo) => hallazgo.regla === "tema_de_riesgo")
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
    const requiereLineasAyuda = await pideAyuda(deps.db, fila, juicios)
    const respaldo = leerRespaldo(fila.respaldo)
    const revision: Hallazgo[] = [
      ...revisarGuion({
        guion: fila.guion,
        texto,
        esAvatar: true,
        requiereLineasAyuda,
        ajeno: ajenoDelRespaldo(respaldo),
      }),
      ...revisarLinkedinSiHay(fila.texto_linkedin, {
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

/** The states where the LinkedIn text can still be edited: before gate 2, or on a scheduled piece (it takes gate 2 back). */
const ESTADOS_CON_TEXTO_DE_LINKEDIN_EDITABLE: readonly Database["public"]["Enums"]["estado_pieza"][] = [
  "guion_por_aprobar",
  "guion_aprobado",
  "video_por_aprobar",
  "programado",
]

/**
 * Coni edits the LinkedIn text, or saves the one the screen started from the caption. It is reviewed again with
 * LinkedIn's rules; the findings of the script, the caption and Claude's judgments stay. Unlike the caption it is not
 * part of gate 1, so editing it leaves gate 1 as it is; on a scheduled piece it takes gate 2 back.
 */
export function editarTextoLinkedin(deps: DepsAcciones, piezaId: string, versionVista: number, textoNuevo: string) {
  return aResultado("editarTextoLinkedin", async () => {
    const texto = normalizarTexto(textoNuevo)
    if (texto === "") throw new Falla("El texto no puede quedar vacío.")
    if ([...texto].length > MAXIMO_TEXTO_LINKEDIN) {
      throw new Falla("LinkedIn acepta hasta 3.000 caracteres en el texto.")
    }

    const fila = await leerObligatoria(deps.db, piezaId)
    exigirVersion(fila, versionVista)
    if (!ESTADOS_CON_TEXTO_DE_LINKEDIN_EDITABLE.includes(fila.estado)) {
      throw new TransicionInvalida(fila.estado, "editar_texto")
    }

    const actual = leerRevision(fila.revision)
    const juicios = actual.filter(esJuicioDeClaude)
    const requiereLineasAyuda = await pideAyuda(deps.db, fila, juicios)
    // Claude's findings about the old LinkedIn text are about text that no longer exists: they go with it.
    const juiciosQueQuedan = juicios.filter((juicio) => juicio.campo !== "linkedin")
    const ajeno = ajenoDelRespaldo(leerRespaldo(fila.respaldo))
    const delGuionYElTexto = sinLinkedin(actual).filter((hallazgo) => !esJuicioDeClaude(hallazgo))
    const revision: Hallazgo[] = [
      ...delGuionYElTexto,
      ...revisarLinkedinSiHay(texto, { esAvatar: true, requiereLineasAyuda, ajeno }),
      ...juiciosQueQuedan,
    ]

    // Written as Coni (the database function is hers alone), so the audit row names her and not the service role.
    const { error } = await deps.db.rpc("editar_texto_linkedin_como_coni", {
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

/**
 * Gate 2 approves the video, the caption, the LinkedIn text (when LinkedIn is chosen), the destinations and the time.
 * Formula 2 hashes all of it, and the destinations go in the same update as the approval so the database sees both
 * change together. `versionVista` is the version of the screen she signed, and the write only matches that version,
 * so the hash recomputed here is the hash of exactly what she saw.
 */
export function aprobarVideo(
  deps: DepsAcciones,
  piezaId: string,
  versionVista: number,
  publicarEn: string,
  destinosElegidos: readonly string[],
) {
  return aResultado("aprobarVideo", async () => {
    if (!destinosValidos(destinosElegidos)) throw new Falla("Elige al menos un destino.")
    const destinos = canonicos(destinosElegidos)
    const conLinkedin = destinos.includes("linkedin")
    const fila = await leerObligatoria(deps.db, piezaId)
    exigirVersion(fila, versionVista, new ArtefactoCambio())
    if (fila.estado !== "video_por_aprobar") throw new TransicionInvalida(fila.estado, "aprobar_video")
    if (fila.video_id === null || fila.texto === null) {
      throw new Error(`La pieza ${fila.id} está por aprobar sin video o sin texto.`)
    }
    if (conLinkedin && (fila.texto_linkedin === null || fila.texto_linkedin.trim() === "")) {
      throw new Falla("Falta el texto para LinkedIn.")
    }
    exigirRevisionLimpia(fila, { linkedin: conLinkedin })
    // What she already uploaded survives a withdrawal of gate 2: a choice made only of that has nothing left to do.
    const subidos = (await leerPublicaciones(deps.db, fila.id))
      .filter((p) => p.estado === "subido_a_mano" || p.estado === "publicado")
      .map((p) => p.destino)
    if (destinos.every((destino) => subidos.includes(destino)))
      throw new Falla("Eso ya lo subiste. Elige otro destino.")
    await exigirHorarioLibre(deps.db, fila.id, publicarEn)
    const hash = hashTextoDePuerta2(2, { texto: fila.texto, textoLinkedin: fila.texto_linkedin, destinos })
    await guardarEvento(
      deps.db,
      fila,
      {
        tipo: "aprobar_video",
        actor: "coni",
        videoVisto: fila.video_id,
        hashTextoVisto: hash,
        hashTextoActual: hash,
        formula: 2,
        publicarEn,
        en: deps.ahora(),
      },
      { destinos },
    )
    // Nothing to start: `publicar-pendientes` takes the piece when its approved time arrives.
    return {}
  })
}

export function regrabar(deps: DepsAcciones, piezaId: string, versionVista: number) {
  return aResultado("regrabar", async () => {
    const fila = await leerObligatoria(deps.db, piezaId)
    exigirVersion(fila, versionVista)
    const guardada = await guardarEvento(deps.db, fila, { tipo: "regrabar" })
    return iniciar(
      "grabar-pieza",
      () => deps.disparar.grabar(guardada.id, claveGrabar(guardada), guardada.intento),
      AVISO_GRABACION,
    )
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
    return iniciar(
      "grabar-pieza",
      () => deps.disparar.grabar(guardada.id, claveGrabar(guardada), guardada.intento),
      AVISO_GRABACION,
    )
  })
}

/**
 * Coni uploaded the reel to one destination herself and says so. It is written with her session by a function that
 * marks that destination and, when nothing else is pending, the piece, in one transaction: the audit rows carry her
 * name and the database refuses anybody else. The link is optional, checked as text and never fetched.
 */
export function marcarSubidoAMano(
  deps: DepsAcciones,
  piezaId: string,
  versionVista: number,
  destino: string,
  enlace: string,
) {
  return aResultado("marcarSubidoAMano", async () => {
    if (!esDestino(destino)) throw new Falla("Ese destino no existe.")
    const permalink = destino === "instagram" ? enlaceDeInstagram(enlace) : enlaceDeLinkedIn(enlace)
    const fila = await leerObligatoria(deps.db, piezaId)
    exigirVersion(fila, versionVista)
    const { pendientes } = resumenDePublicaciones(await leerPublicaciones(deps.db, fila.id))
    // The state and what follows are validated here and applied by the function below, which repeats them in SQL.
    transicionar(piezaDesdeFila(fila), {
      tipo: "subido_a_mano",
      actor: "coni",
      destino,
      quedanPendientes: pendientes.some((pendiente) => pendiente !== destino),
    })
    if (!pendientes.includes(destino)) throw new Falla(DESTINO_YA_NO_ESPERA)
    if (destino === "instagram" && fila.estado === "programado" && (await leerInstagramConectado(deps.db))) {
      throw new Falla(INSTAGRAM_SALE_SOLO)
    }

    const { error } = await deps.db.rpc("marcar_subido_como_coni", {
      p_pieza: fila.id,
      p_version: fila.version,
      p_destino: destino,
      p_enlace: permalink ?? "",
    })
    if (error) throw traducir(new Error(error.message, { cause: error }))
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
