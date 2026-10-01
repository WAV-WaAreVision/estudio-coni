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
  estadoAntesDelError: Estado | null
  audioId: string | null
  videoId: string | null
  puerta1: AprobacionGuion | null
  puerta2: AprobacionVideo | null
  explicacion: string | null
}

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
  | { tipo: "reintentar"; ahora: string }
  | { tipo: "descartar" }

/** Side effects the caller must complete before persisting the transition. */
export type Efecto = "cancelar_publicacion" | "revisar_texto"

export interface Transicion {
  pieza: Pieza
  efectos: Efecto[]
}

export class TransicionInvalida extends Falla {
  constructor(estado: Estado, evento: Evento["tipo"]) {
    super(`No se puede hacer "${evento}" cuando la pieza está en "${estado}".`)
    this.name = "TransicionInvalida"
  }
}

export class ArtefactoCambio extends Falla {
  constructor() {
    super("Lo que aprobaste cambió mientras lo revisabas. Vuelve a revisarlo.")
    this.name = "ArtefactoCambio"
  }
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
    throw new Falla("Solo Coni puede aprobar.")
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
        return a("video_por_aprobar", { puerta2: null }, ["cancelar_publicacion", "revisar_texto"])
      }
      throw invalida()

    case "aprobar_guion":
      if (estado !== "guion_por_aprobar" || !pieza.audioId) throw invalida()
      soloConi(evento.actor)
      if (evento.hashVisto !== evento.hashActual) throw new ArtefactoCambio()
      return a("en_render", { puerta1: { hash: evento.hashVisto, en: evento.en } })

    case "render_entregado":
      if (estado !== "en_render") throw invalida()
      return a("subtitulando")

    case "politica_contenido":
      if (estado !== "en_render") throw invalida()
      return a("guion_por_aprobar", { puerta1: null, explicacion: evento.explicacion })

    case "falla_produccion":
      if (estado !== "en_render" && estado !== "subtitulando") throw invalida()
      return a("error_produccion", { estadoAntesDelError: estado, explicacion: evento.explicacion })

    case "video_listo":
      if (estado !== "subtitulando") throw invalida()
      return a("video_por_aprobar", { videoId: evento.videoId })

    case "aprobar_video": {
      if (estado !== "video_por_aprobar") throw invalida()
      soloConi(evento.actor)
      if (evento.videoVisto !== pieza.videoId || evento.hashTextoVisto !== evento.hashTextoActual) {
        throw new ArtefactoCambio()
      }
      const publicarEn = Date.parse(evento.publicarEn)
      const aprobadoEn = Date.parse(evento.en)
      if (Number.isNaN(publicarEn) || Number.isNaN(aprobadoEn)) {
        throw new Falla("La fecha de publicación no es válida.")
      }
      if (publicarEn <= aprobadoEn) {
        throw new Falla("La fecha de publicación ya pasó. Elige una hora futura.")
      }
      const puerta2 = {
        videoId: evento.videoVisto,
        hashTexto: evento.hashTextoVisto,
        publicarEn: evento.publicarEn,
        en: evento.en,
      }
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

    case "reintentar": {
      const intento = pieza.intento + 1
      if (estado === "error_produccion" && pieza.estadoAntesDelError) {
        return a(pieza.estadoAntesDelError, { estadoAntesDelError: null, intento })
      }
      if (estado === "error_publicacion") {
        const atraso = pieza.puerta2
          ? Date.parse(evento.ahora) - Date.parse(pieza.puerta2.publicarEn)
          : Number.POSITIVE_INFINITY
        // An unreadable current time is treated as late: ask Coni again instead of rescheduling blindly.
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
      return a("descartado", { puerta1: null, puerta2: null }, estado === "programado" ? ["cancelar_publicacion"] : [])
  }
}
