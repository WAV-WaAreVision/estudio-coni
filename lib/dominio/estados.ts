import { Falla } from "@/lib/dominio/falla"

export const ESTADOS = [
  "idea",
  "guion_en_proceso",
  "guion_por_aprobar",
  "en_render",
  "subtitulando",
  "video_por_aprobar",
  "programado",
  "publicado",
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

export interface AprobacionGuion {
  hash: string
  en: string
}

export interface AprobacionVideo {
  videoId: string
  hashTexto: string
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
  | { tipo: "guion_listo"; audioId: string }
  | { tipo: "pedir_cambios" }
  | { tipo: "editar_texto" }
  | { tipo: "aprobar_guion"; actor: Actor; hashVisto: string; hashActual: string; en: string }
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
      publicarEn: string
      en: string
    }
  | { tipo: "regrabar" }
  | { tipo: "cambiar_guion" }
  | { tipo: "cambiar_fecha" }
  | { tipo: "publicado" }
  | { tipo: "falla_publicacion"; explicacion: string }
  | { tipo: "hora_vencida" }
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
      return a("guion_por_aprobar", { audioId: evento.audioId })

    case "pedir_cambios":
      if (estado !== "guion_por_aprobar") throw invalida()
      return a("guion_en_proceso", { audioId: null })

    case "editar_texto":
      if (estado === "guion_por_aprobar") return a("guion_por_aprobar", {}, ["revisar_texto"])
      if (estado === "video_por_aprobar") return a("video_por_aprobar", { puerta2: null }, ["revisar_texto"])
      if (estado === "programado") {
        return a("video_por_aprobar", { puerta2: null, intento: pieza.intento + 1 }, [
          "cancelar_publicacion",
          "revisar_texto",
        ])
      }
      throw invalida()

    case "aprobar_guion":
      // The actor is checked first so an unauthorised attempt is flagged even on a stale piece.
      soloConi(evento.actor)
      if (estado !== "guion_por_aprobar" || !pieza.audioId) throw invalida()
      if (evento.hashVisto !== evento.hashActual) throw new ArtefactoCambio()
      return a("en_render", { puerta1: { hash: evento.hashVisto, en: instanteDelServidor(evento.en) } })

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
      const puerta2 = { videoId: evento.videoVisto, hashTexto: evento.hashTextoVisto, publicarEn, en: aprobadoEn }
      return a("programado", { puerta2 })
    }

    case "regrabar":
      if (estado !== "video_por_aprobar") throw invalida()
      return a("en_render", { videoId: null, intento: pieza.intento + 1 })

    case "cambiar_guion":
      if (estado !== "video_por_aprobar") throw invalida()
      return a("guion_en_proceso", { puerta1: null, audioId: null, videoId: null })

    case "cambiar_fecha":
      if (estado !== "programado") throw invalida()
      return a("video_por_aprobar", { puerta2: null, intento: pieza.intento + 1 }, ["cancelar_publicacion"])

    case "publicado":
      if (estado !== "programado") throw invalida()
      return a("publicado")

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
      if (estado === "publicado" || estado === "descartado") throw invalida()
      // error_publicacion also cancels: the provider may still hold the post if it answers late.
      return a(
        "descartado",
        { puerta1: null, puerta2: null },
        estado === "programado" || estado === "error_publicacion" ? ["cancelar_publicacion"] : [],
      )
  }
}
