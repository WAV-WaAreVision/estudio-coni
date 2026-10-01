import { estimarSegundos, palabras, valorDefinido } from "@/lib/dominio/estimaciones"
import { Falla } from "@/lib/dominio/falla"

export const MODELOS_ELEVEN = new Set(["eleven_multilingual_v2", "eleven_v3", "eleven_turbo_v2_5", "eleven_flash_v2_5"])

export interface AjustesElevenlabs {
  model?: string
  stability?: number | null
  [clave: string]: unknown
}

/** Same shape as the `ruta_voz` and `heygen` keys of coni.config.json, which move to Ajustes. */
export interface ConfigProduccion {
  ruta_voz: "heygen" | "elevenlabs"
  heygen: {
    avatar_id: string | null
    voice_id: string | null
    ajustes_elevenlabs: AjustesElevenlabs | null
    velocidad?: number | null
    aspect_ratio: string | null
    resolution: string | null
    motor: string | null
    referencia_movimiento: string | null
  }
}

/** Body of HeyGen v3 `POST /v3/videos`. */
export interface PedidoHeygen {
  type: "avatar"
  avatar_id: string
  title: string
  aspect_ratio: string
  caption: { file_format: "srt" }
  resolution?: string
  engine?: { type: string; reference_look_id?: string }
  audio_asset_id?: string
  script?: string
  voice_id?: string
  voice_settings?: {
    engine_settings?: AjustesElevenlabs & { engine_type: "elevenlabs" }
    speed?: number
  }
}

export interface Pedido {
  cuerpo: PedidoHeygen
  /** A: HeyGen speaks the script with the imported ElevenLabs voice. B: HeyGen lip-syncs our own audio. */
  ruta: "A" | "B"
  palabras: number
  segundos: number
  avisos: string[]
}

function textoDelGuion(guion: string | null): string {
  if (guion === null) {
    throw new Falla("Falta el guion aprobado.")
  }
  const texto = guion.trim()
  if (!texto) {
    throw new Falla("El guion está vacío.")
  }
  return texto
}

export function armarPedido(entrada: {
  config: ConfigProduccion
  guion: string | null
  titulo: string
  audioAssetId?: string
  avatarId?: string
}): Pedido {
  const { config, titulo, audioAssetId, avatarId } = entrada
  const hg = config.heygen
  const texto = textoDelGuion(entrada.guion)

  const avatar = valorDefinido(avatarId || hg.avatar_id)
  if (!avatar) {
    throw new Falla("Falta heygen.avatar_id en la configuración.")
  }
  const cuerpo: PedidoHeygen = {
    type: "avatar",
    avatar_id: avatar,
    title: titulo,
    aspect_ratio: hg.aspect_ratio || "9:16",
    caption: { file_format: "srt" },
  }
  if (hg.resolution) {
    cuerpo.resolution = hg.resolution
  }

  const referencia = valorDefinido(hg.referencia_movimiento)
  if (hg.motor === "avatar_v") {
    if (!referencia) {
      throw new Falla(
        "Con motor avatar_v falta heygen.referencia_movimiento (un digital_twin del grupo). Sin ella, HeyGen puede usar el movimiento de un look público de otra persona.",
      )
    }
    cuerpo.engine = { type: "avatar_v", reference_look_id: referencia }
  } else if (referencia) {
    throw new Falla("heygen.referencia_movimiento solo sirve con motor avatar_v.")
  } else if (hg.motor) {
    cuerpo.engine = { type: hg.motor }
  }

  let ruta: "A" | "B"
  if (audioAssetId) {
    cuerpo.audio_asset_id = audioAssetId
    ruta = "B"
  } else if (config.ruta_voz === "elevenlabs") {
    throw new Falla("La Ruta B necesita el audio de ElevenLabs subido a HeyGen (audio_asset_id).")
  } else {
    const voz = valorDefinido(hg.voice_id)
    if (!voz) {
      throw new Falla("Falta heygen.voice_id en la configuración.")
    }
    cuerpo.script = texto
    cuerpo.voice_id = voz
    const ajustesVoz: NonNullable<PedidoHeygen["voice_settings"]> = {}
    const ajustes = hg.ajustes_elevenlabs
    // Like coni.py, an empty settings object counts as no settings.
    if (ajustes && Object.keys(ajustes).length > 0) {
      if (ajustes.model && !MODELOS_ELEVEN.has(ajustes.model)) {
        throw new Falla(`Modelo de ElevenLabs no válido: ${ajustes.model}`)
      }
      const stability = ajustes.stability
      if (
        ajustes.model === "eleven_v3" &&
        stability !== undefined &&
        stability !== null &&
        ![0, 0.5, 1].includes(stability)
      ) {
        throw new Falla("Con eleven_v3, stability debe ser 0, 0.5 o 1.")
      }
      ajustesVoz.engine_settings = { engine_type: "elevenlabs", ...ajustes }
    }
    if (typeof hg.velocidad === "number" && hg.velocidad !== 1) {
      ajustesVoz.speed = hg.velocidad
    }
    if (Object.keys(ajustesVoz).length > 0) {
      cuerpo.voice_settings = ajustesVoz
    }
    ruta = "A"
  }

  const segundos = estimarSegundos(texto)
  const avisos = segundos > 90 ? ["El guion pasa de 90 s. Para Reels conviene de 30 a 60 s."] : []
  return { cuerpo, ruta, palabras: palabras(texto).length, segundos, avisos }
}
