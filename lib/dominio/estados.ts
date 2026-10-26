import type { Destino } from "@/lib/dominio/destinos"
import { Falla } from "@/lib/dominio/falla"

export const ESTADOS = [
  "idea",
  "guion_en_proceso",
  "guion_por_aprobar",
  "guion_aprobado",
  "grabando_voz",
  "en_render",
  "subtitulando",
  "video_por_aprobar",
  // A LinkedIn carousel (design 2026-10-26): signed text waiting for its slides, then its slides waiting for gate 2.
  "armando_carrusel",
  "carrusel_por_aprobar",
  "programado",
  "para_subir_a_mano",
  "publicado",
  "publicado_a_mano",
  "error_produccion",
  "error_publicacion",
  "descartado",
] as const
export type Estado = (typeof ESTADOS)[number]
export type Actor = "coni" | "sistema" | "admin"
/** Steps a failed piece can be retried from. */
export type EstadoAntesDelError = "en_render" | "subtitulando" | "programado"

/** An approved time this late goes back to Coni instead of being published (accepted change A3). */
export const MARGEN_HORA_APROBADA_MS = 30 * 60 * 1000

/** How long Coni can take her gate 1 signature back before the video is recorded (design 2026-10-15, decision 5). */
export const VENTANA_DESHACER_MS = 8000
/** What the render adds to the window, so a task clock a little behind the app's never records before it closes. */
export const MARGEN_DE_RELOJ_MS = 2000
/** Said when the undo arrives after the window: the run may have started, so the video goes on. */
export const TEXTO_DESHACER_TARDE = "Ya empecé a grabar el video. Puedes revisarlo cuando esté listo."

export interface AprobacionGuion {
  hash: string
  en: string
}

export interface AprobacionVideo {
  videoId: string
  hashTexto: string
  /** How `hashTexto` was computed (`hashTextoDePuerta2`): 1 is an approval from before LinkedIn, 2 binds its text too. */
  formula: 1 | 2
  publicarEn: string
  en: string
}

export interface Pieza {
  estado: Estado
  /** Optimistic lock: every transition bumps it; the database update requires the old value. */
  version: number
  /** Part of the idempotency key: Regrabar, retries and date changes bump it (R2-1). */
  intento: number
  estadoAntesDelError: EstadoAntesDelError | null
  audioId: string | null
  videoId: string | null
  puerta1: AprobacionGuion | null
  puerta2: AprobacionVideo | null
  explicacion: string | null
}

/**
 * `en` and `ahora` come from the server clock, never from the client. `hashActual` and `hashTextoActual` are
 * recomputed from the database row in the same transaction as the `version` check.
 */
export type Evento =
  | { tipo: "elegir" }
  /** The writer hands the script over with her voice of it; without a voice, only together with the reason. */
  | { tipo: "guion_listo"; audioId: string }
  | { tipo: "guion_listo"; audioId: null; explicacion: string }
  | { tipo: "pedir_cambios" }
  | { tipo: "editar_texto" }
  /** Coni signs the script, her voice and the video spend in one gesture; the video starts after the undo window. */
  | { tipo: "aprobar_guion"; actor: Actor; hashVisto: string; hashActual: string; en: string }
  /** Her voice of the current script, before the signature (spends ElevenLabs; a script edit asks for it too). */
  | { tipo: "pedir_voz" }
  | { tipo: "falla_voz"; explicacion: string }
  /** Coni takes her gate 1 signature back while the undo window lasts. `ahora` is the server clock. */
  | { tipo: "deshacer_aprobacion"; actor: Actor; ahora: string }
  /** The voice is stored by the voice task, or by the render when it had to make it. */
  | { tipo: "voz_lista"; audioId: string }
  | { tipo: "render_entregado" }
  | { tipo: "politica_contenido"; explicacion: string }
  | { tipo: "falla_produccion"; explicacion: string }
  | { tipo: "video_listo"; videoId: string }
  | {
      tipo: "aprobar_video"
      actor: Actor
      videoVisto: string
      hashTextoVisto: string
      hashTextoActual: string
      formula: 1 | 2
      publicarEn: string
      en: string
    }
  | { tipo: "regrabar" }
  | { tipo: "cambiar_guion" }
  | { tipo: "cambiar_fecha" }
  /**
   * `quedanAMano`: a destination she uploads herself is still pending. `algunoAMano`: nothing is pending, but one
   * destination was uploaded by hand (the last automatic one closes a mixed piece, design 2026-10-07 L7).
   */
  | { tipo: "publicado"; quedanAMano?: boolean; algunoAMano?: boolean }
  | { tipo: "falla_publicacion"; explicacion: string }
  | { tipo: "hora_vencida" }
  /** Instagram is not connected and the approved time came: the piece waits for Coni to upload it herself. */
  | { tipo: "entregar_para_subir" }
  /** `quedanPendientes`: another destination of the piece still waits, so only this one is done. */
  | { tipo: "subido_a_mano"; actor: Actor; destino: Destino; quedanPendientes: boolean }
  | { tipo: "reintentar"; ahora: string }
  | { tipo: "descartar" }

/** Side effects the caller must complete before persisting the transition. */
export type Efecto = "cancelar_publicacion" | "revisar_texto"

export interface Transicion {
  pieza: Pieza
  efectos: Efecto[]
}

export class TransicionInvalida extends Falla {
  constructor(
    readonly estado: Estado,
    readonly evento: Evento["tipo"],
  ) {
    super("Esta pieza cambió mientras la mirabas. Vuelve a abrirla.")
    this.name = "TransicionInvalida"
  }
}

export class ArtefactoCambio extends Falla {
  constructor() {
    super("Esto cambió mientras lo revisabas y no quedó aprobado. Vuelve a revisarlo.")
    this.name = "ArtefactoCambio"
  }
}

/** Not a Falla on purpose: an approval from another actor is a bug or a security event, never shown to Coni. */
export class AprobacionNoAutorizada extends Error {
  constructor(readonly actor: Actor) {
    super(`Solo Coni puede aprobar (actor recibido: ${actor}).`)
    this.name = "AprobacionNoAutorizada"
  }
}

// Date.parse alone accepts "1" and zone-less strings (read in the server's zone), which would shift an approved time.
const INSTANTE =
  /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/

/** Accepts only ISO 8601 with `Z` or an explicit offset and returns it normalised to UTC; null when unreadable. */
export function instanteEstricto(texto: string): string | null {
  const partes = INSTANTE.exec(texto)
  if (!partes) return null
  const mes = Number(partes[2]) - 1
  const dia = Number(partes[3])
  // Date.parse rolls "02-30" over to March instead of rejecting it.
  const calendario = new Date(Date.UTC(Number(partes[1]), mes, dia))
  if (calendario.getUTCMonth() !== mes || calendario.getUTCDate() !== dia) return null
  const ms = Date.parse(texto)
  return Number.isNaN(ms) ? null : new Date(ms).toISOString()
}

function instanteDelServidor(texto: string): string {
  const instante = instanteEstricto(texto)
  if (!instante) {
    throw new Error(`Instante inválido del reloj del servidor: ${texto}`)
  }
  return instante
}

export function piezaNueva(): Pieza {
  return {
    estado: "idea",
    version: 0,
    intento: 0,
    estadoAntesDelError: null,
    audioId: null,
    videoId: null,
    puerta1: null,
    puerta2: null,
    explicacion: null,
  }
}

/** What is left of the undo window of a signature made at `puerta1En`, on the server clock; 0 once it closed. */
export function restoDeVentana(puerta1En: string, ahora: string): number {
  const cierre = Date.parse(instanteDelServidor(puerta1En)) + VENTANA_DESHACER_MS
  return Math.max(0, cierre - Date.parse(instanteDelServidor(ahora)))
}

/** How long the render waits before it may spend: the undo window plus the clock margin, on the task's clock. */
export function esperaDeVentana(puerta1En: string, ahora: string): number {
  const cierre = Date.parse(instanteDelServidor(puerta1En)) + VENTANA_DESHACER_MS + MARGEN_DE_RELOJ_MS
  return Math.max(0, cierre - Date.parse(instanteDelServidor(ahora)))
}

/** A task is working on the piece right now: the screens that show it refresh themselves until it settles. */
export function piezaTrabajando(pieza: { estado: Estado; explicacion: string | null }): boolean {
  switch (pieza.estado) {
    case "guion_en_proceso":
      // With a reason on it, the script is not being written: it waits for Coni.
      return pieza.explicacion === null
    case "grabando_voz":
      return true
    case "en_render":
    case "subtitulando":
      // With a reason on it (the monthly cap stopped the run) the piece waits for Coni: nothing to poll for.
      return pieza.explicacion === null
    default:
      return false
  }
}

function soloConi(actor: Actor): void {
  if (actor !== "coni") {
    throw new AprobacionNoAutorizada(actor)
  }
}

export function transicionar(pieza: Pieza, evento: Evento): Transicion {
  const { estado } = pieza
  const a = (destino: Estado, cambios: Partial<Pieza> = {}, efectos: Efecto[] = []): Transicion => ({
    pieza: { ...pieza, explicacion: null, ...cambios, estado: destino, version: pieza.version + 1 },
    efectos,
  })
  const invalida = () => new TransicionInvalida(estado, evento.tipo)

  switch (evento.tipo) {
    case "elegir":
      if (estado !== "idea") throw invalida()
      return a("guion_en_proceso")

    case "guion_listo":
      if (estado !== "guion_en_proceso") throw invalida()
      return a("guion_por_aprobar", {
        audioId: evento.audioId,
        explicacion: evento.audioId === null ? evento.explicacion : null,
      })

    case "pedir_cambios":
      if (estado !== "guion_por_aprobar") throw invalida()
      // A new script round is a new attempt: its Claude and voice spend must not reuse the keys of the old round.
      return a("guion_en_proceso", { audioId: null, intento: pieza.intento + 1 })

    case "editar_texto": {
      // Editing the caption does not answer the reason on the piece (no voice, a missed hour): it stays, as in
      // `editar_texto_como_coni`.
      const nota = pieza.explicacion
      if (estado === "guion_por_aprobar") return a("guion_por_aprobar", { explicacion: nota }, ["revisar_texto"])
      if (estado === "video_por_aprobar") {
        return a("video_por_aprobar", { puerta2: null, explicacion: nota }, ["revisar_texto"])
      }
      if (estado === "programado") {
        return a("video_por_aprobar", { puerta2: null, intento: pieza.intento + 1, explicacion: nota }, [
          "cancelar_publicacion",
          "revisar_texto",
        ])
      }
      throw invalida()
    }

    case "aprobar_guion":
      // The actor is checked first so an unauthorised attempt is flagged even on a stale piece.
      soloConi(evento.actor)
      if (estado !== "guion_por_aprobar") throw invalida()
      if (evento.hashVisto !== evento.hashActual) throw new ArtefactoCambio()
      // The signature commits the video (design 2026-10-15): the action starts it after the undo window. The voice
      // she heard stays; the action checked that it speaks this script.
      return a("en_render", { puerta1: { hash: evento.hashVisto, en: instanteDelServidor(evento.en) } })

    case "pedir_voz":
      if (estado !== "guion_por_aprobar") throw invalida()
      // A new attempt: a new run, a new spend key and, for "Grabar la voz de nuevo", a new take.
      return a("grabando_voz", { intento: pieza.intento + 1 })

    case "voz_lista":
      if (estado === "grabando_voz") return a("guion_por_aprobar", { audioId: evento.audioId })
      if (estado !== "en_render") throw invalida()
      return a("en_render", { audioId: evento.audioId })

    case "falla_voz":
      if (estado !== "grabando_voz") throw invalida()
      // A new attempt, so the next voice or render never meets the released reservation of this one.
      return a("guion_por_aprobar", { intento: pieza.intento + 1, explicacion: evento.explicacion })

    case "deshacer_aprobacion":
      soloConi(evento.actor)
      if (estado !== "en_render" || pieza.puerta1 === null) throw invalida()
      if (restoDeVentana(pieza.puerta1.en, evento.ahora) === 0) throw new Falla(TEXTO_DESHACER_TARDE)
      // Her voice stays. The attempt moves on: the delayed run of this signature still fires, finds the piece here and
      // finishes, and Trigger.dev keeps the key of a finished run, so signing the same text again under the same key
      // would get that finished run back and the video would never start.
      return a("guion_por_aprobar", { puerta1: null, intento: pieza.intento + 1 })

    case "render_entregado":
      if (estado !== "en_render") throw invalida()
      return a("subtitulando")

    case "politica_contenido":
      if (estado !== "en_render") throw invalida()
      return a("guion_por_aprobar", { puerta1: null, intento: pieza.intento + 1, explicacion: evento.explicacion })

    case "falla_produccion":
      if (estado !== "en_render" && estado !== "subtitulando") throw invalida()
      return a("error_produccion", { estadoAntesDelError: estado, explicacion: evento.explicacion })

    case "video_listo":
      if (estado !== "subtitulando") throw invalida()
      return a("video_por_aprobar", { videoId: evento.videoId })

    case "aprobar_video": {
      soloConi(evento.actor)
      if (estado !== "video_por_aprobar") throw invalida()
      if (evento.videoVisto !== pieza.videoId || evento.hashTextoVisto !== evento.hashTextoActual) {
        throw new ArtefactoCambio()
      }
      const aprobadoEn = instanteDelServidor(evento.en)
      const publicarEn = instanteEstricto(evento.publicarEn)
      if (!publicarEn) {
        throw new Falla("La fecha de publicación no es válida.")
      }
      if (Date.parse(publicarEn) <= Date.parse(aprobadoEn)) {
        throw new Falla("La fecha de publicación ya pasó. Elige una hora futura.")
      }
      const puerta2 = {
        videoId: evento.videoVisto,
        hashTexto: evento.hashTextoVisto,
        formula: evento.formula,
        publicarEn,
        en: aprobadoEn,
      }
      return a("programado", { puerta2 })
    }

    case "regrabar":
      if (estado !== "video_por_aprobar") throw invalida()
      return a("en_render", { videoId: null, intento: pieza.intento + 1 })

    case "cambiar_guion":
      if (estado !== "video_por_aprobar") throw invalida()
      return a("guion_en_proceso", { puerta1: null, audioId: null, videoId: null, intento: pieza.intento + 1 })

    case "cambiar_fecha":
      if (estado !== "programado") throw invalida()
      return a("video_por_aprobar", { puerta2: null, intento: pieza.intento + 1 }, ["cancelar_publicacion"])

    case "publicado":
      if (estado !== "programado") throw invalida()
      // Instagram went out by itself and a destination that goes by hand still waits for her.
      if (evento.quedanAMano) return a("para_subir_a_mano")
      return a(evento.algunoAMano ? "publicado_a_mano" : "publicado")

    case "falla_publicacion":
      if (estado !== "programado") throw invalida()
      return a("error_publicacion", { estadoAntesDelError: "programado", explicacion: evento.explicacion })

    case "hora_vencida":
      if (estado !== "programado") throw invalida()
      return a(
        "video_por_aprobar",
        {
          puerta2: null,
          intento: pieza.intento + 1,
          explicacion: "La hora aprobada pasó sin publicarse. Elige una nueva fecha.",
        },
        ["cancelar_publicacion"],
      )

    case "entregar_para_subir":
      if (estado !== "programado") throw invalida()
      return a("para_subir_a_mano")

    case "subido_a_mano":
      // Only she can say it: nobody else knows the reel is up.
      soloConi(evento.actor)
      if (estado !== "programado" && estado !== "para_subir_a_mano") throw invalida()
      // One destination is done and another still waits: the piece keeps its state and its scheduled publication.
      if (evento.quedanPendientes) return a(estado)
      // Before the approved time the scheduled publication must not happen too, or the reel would go out twice.
      return a("publicado_a_mano", {}, estado === "programado" ? ["cancelar_publicacion"] : [])

    case "reintentar": {
      const ahora = instanteDelServidor(evento.ahora)
      const intento = pieza.intento + 1
      if (estado === "error_produccion" && pieza.estadoAntesDelError) {
        return a(pieza.estadoAntesDelError, { estadoAntesDelError: null, intento })
      }
      if (estado === "error_publicacion") {
        const atraso = pieza.puerta2
          ? Date.parse(ahora) - Date.parse(pieza.puerta2.publicarEn)
          : Number.POSITIVE_INFINITY
        // An unreadable stored time is treated as late: ask Coni again instead of rescheduling blindly.
        if (Number.isNaN(atraso) || atraso > MARGEN_HORA_APROBADA_MS) {
          return a("video_por_aprobar", {
            estadoAntesDelError: null,
            puerta2: null,
            intento,
            explicacion: "La hora aprobada ya pasó. Elige una nueva fecha.",
          })
        }
        return a("programado", { estadoAntesDelError: null, intento })
      }
      throw invalida()
    }

    case "descartar":
      if (estado === "publicado" || estado === "publicado_a_mano" || estado === "descartado") throw invalida()
      // error_publicacion also cancels: the provider may still hold the post if it answers late.
      return a(
        "descartado",
        // The `error_con_origen` constraint ties this column to the error states, so it cannot outlive them.
        { puerta1: null, puerta2: null, estadoAntesDelError: null },
        estado === "programado" || estado === "error_publicacion" ? ["cancelar_publicacion"] : [],
      )
  }
}
