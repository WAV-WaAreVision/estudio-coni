import { describe, expect, it } from "vitest"
import { Falla, FallaDeConfiguracion } from "@/lib/dominio/falla"
import { armarPedido, type ConfigProduccion } from "@/lib/proveedores/heygen"

const GUION = "¿Peleas siempre por lo mismo?\n\nSoy Coni del Rosario."
const TITULO = "Coni · 2026-09-29-celos"

function config(): ConfigProduccion {
  return {
    ruta_voz: "heygen",
    heygen: {
      avatar_id: "look_123",
      voice_id: "voz_456",
      ajustes_elevenlabs: {
        model: "eleven_multilingual_v2",
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0,
        use_speaker_boost: true,
      },
      velocidad: 1,
      aspect_ratio: "9:16",
      resolution: "1080p",
      motor: null,
      referencia_movimiento: null,
    },
  }
}

function pedido(cfg = config(), extra: { audioAssetId?: string; avatarId?: string; guion?: string | null } = {}) {
  return armarPedido({ config: cfg, guion: GUION, titulo: TITULO, ...extra })
}

function errorDe(accion: () => unknown): unknown {
  try {
    accion()
  } catch (error) {
    return error
  }
  throw new Error("Se esperaba un error y no hubo ninguno.")
}

describe("armarPedido", () => {
  it("arma el pedido de la ruta a cuando la config está completa", () => {
    const cfg = config()
    const { cuerpo, ruta } = pedido(cfg)
    expect(cuerpo.type).toBe("avatar")
    expect(cuerpo.avatar_id).toBe("look_123")
    expect(cuerpo.voice_id).toBe("voz_456")
    expect(cuerpo.script).toBe(GUION)
    expect(cuerpo.title).toBe(TITULO)
    expect(cuerpo.aspect_ratio).toBe("9:16")
    expect(cuerpo.resolution).toBe("1080p")
    // Only the separate SRT: HeyGen's burned-in captions sit where Instagram covers them.
    expect(cuerpo.caption).toEqual({ file_format: "srt" })
    expect(cuerpo.voice_settings).toEqual({
      engine_settings: { engine_type: "elevenlabs", ...cfg.heygen.ajustes_elevenlabs },
    })
    expect(cuerpo).not.toHaveProperty("engine")
    expect(cuerpo).not.toHaveProperty("audio_asset_id")
    expect(ruta).toBe("A")
  })

  it("usa otro look cuando se indica avatar id", () => {
    expect(pedido(config(), { avatarId: "foto_2" }).cuerpo.avatar_id).toBe("foto_2")
  })

  it("agrega la velocidad cuando no es uno", () => {
    const cfg = config()
    cfg.heygen.velocidad = 1.1
    expect(pedido(cfg).cuerpo.voice_settings?.speed).toBe(1.1)
  })

  it("agrega el motor cuando la config lo define", () => {
    const cfg = config()
    cfg.heygen.motor = "avatar_iv"
    expect(pedido(cfg).cuerpo.engine).toEqual({ type: "avatar_iv" })
  })

  it("fija el gemelo como referencia cuando el motor es avatar_v", () => {
    const cfg = config()
    cfg.heygen.motor = "avatar_v"
    cfg.heygen.referencia_movimiento = "gemelo_1"
    expect(pedido(cfg).cuerpo.engine).toEqual({ type: "avatar_v", reference_look_id: "gemelo_1" })
  })

  it("falla cuando avatar_v no tiene referencia de movimiento", () => {
    // Without a reference, HeyGen may animate the photo with a public look's motion (another person).
    const cfg = config()
    cfg.heygen.motor = "avatar_v"
    expect(errorDe(() => pedido(cfg))).toBeInstanceOf(FallaDeConfiguracion)
    expect(() => pedido(cfg)).toThrow("referencia_movimiento")
  })

  it("falla cuando hay referencia de movimiento sin avatar_v", () => {
    const cfg = config()
    cfg.heygen.referencia_movimiento = "gemelo_1"
    expect(errorDe(() => pedido(cfg))).toBeInstanceOf(FallaDeConfiguracion)
    expect(() => pedido(cfg)).toThrow("solo sirve con motor avatar_v")
  })

  it("ignora un engine_type distinto en los ajustes", () => {
    // Deliberate divergence from coni.py, where a config key could override the engine and burn credits.
    const cfg = config()
    cfg.heygen.ajustes_elevenlabs = { model: "eleven_multilingual_v2", stability: 0.5, engine_type: "openai" }
    expect(pedido(cfg).cuerpo.voice_settings?.engine_settings?.engine_type).toBe("elevenlabs")
  })

  it("omite ajustes de voz cuando no vienen de elevenlabs", () => {
    const cfg = config()
    cfg.heygen.ajustes_elevenlabs = null
    expect(pedido(cfg).cuerpo).not.toHaveProperty("voice_settings")
  })

  it("omite ajustes de voz cuando los ajustes de elevenlabs vienen vacíos", () => {
    // coni.py treats an empty settings dict as "none", so the body carries no engine_settings.
    const cfg = config()
    cfg.heygen.ajustes_elevenlabs = {}
    expect(pedido(cfg).cuerpo).not.toHaveProperty("voice_settings")
  })

  it("omite ajustes de voz cuando la velocidad no está en la config", () => {
    const cfg = config()
    cfg.heygen.ajustes_elevenlabs = null
    cfg.heygen.velocidad = undefined
    expect(pedido(cfg).cuerpo).not.toHaveProperty("voice_settings")
  })

  it("usa el audio propio cuando hay audio asset id", () => {
    const cfg = config()
    cfg.ruta_voz = "elevenlabs"
    const { cuerpo, ruta } = pedido(cfg, { audioAssetId: "asset_9" })
    expect(cuerpo.audio_asset_id).toBe("asset_9")
    for (const campo of ["script", "voice_id", "voice_settings"]) {
      expect(cuerpo).not.toHaveProperty(campo)
    }
    expect(ruta).toBe("B")
  })

  it("avisa cuando el guion pasa de noventa segundos", () => {
    const { avisos } = pedido(config(), { guion: "palabra ".repeat(240) })
    expect(avisos.join(" ")).toContain("pasa de 90 s")
  })

  it("falla cuando la ruta b no trae audio asset id", () => {
    const cfg = config()
    cfg.ruta_voz = "elevenlabs"
    expect(errorDe(() => pedido(cfg))).toBeInstanceOf(FallaDeConfiguracion)
    expect(() => pedido(cfg)).toThrow("audio_asset_id")
  })

  it("falla cuando el avatar sigue pendiente", () => {
    const cfg = config()
    cfg.heygen.avatar_id = "PENDIENTE"
    expect(errorDe(() => pedido(cfg))).toBeInstanceOf(FallaDeConfiguracion)
    expect(() => pedido(cfg)).toThrow("avatar_id")
  })

  it("falla cuando la voz sigue pendiente en la ruta a", () => {
    const cfg = config()
    cfg.heygen.voice_id = "PENDIENTE"
    expect(errorDe(() => pedido(cfg))).toBeInstanceOf(FallaDeConfiguracion)
    expect(() => pedido(cfg)).toThrow("voice_id")
  })

  it("falla cuando el modelo de elevenlabs no existe", () => {
    const cfg = config()
    cfg.heygen.ajustes_elevenlabs = { model: "eleven_inventado", stability: 0.5 }
    expect(errorDe(() => pedido(cfg))).toBeInstanceOf(FallaDeConfiguracion)
    expect(() => pedido(cfg)).toThrow("Modelo de ElevenLabs no válido")
  })

  it("falla cuando eleven_v3 trae una stability no permitida", () => {
    const cfg = config()
    cfg.heygen.ajustes_elevenlabs = { model: "eleven_v3", stability: 0.3 }
    expect(errorDe(() => pedido(cfg))).toBeInstanceOf(FallaDeConfiguracion)
    expect(() => pedido(cfg)).toThrow("stability")
  })

  // A missing or empty script is Coni's to fix, so it must not be tagged as a WAV-only configuration error.
  it("falla con un mensaje para Coni cuando no hay guion", () => {
    const error = errorDe(() => pedido(config(), { guion: null }))
    expect(error).toBeInstanceOf(Falla)
    expect(error).not.toBeInstanceOf(FallaDeConfiguracion)
    expect(() => pedido(config(), { guion: null })).toThrow("Falta")
  })

  it("falla con un mensaje para Coni cuando el guion está vacío", () => {
    const error = errorDe(() => pedido(config(), { guion: "  \n" }))
    expect(error).toBeInstanceOf(Falla)
    expect(error).not.toBeInstanceOf(FallaDeConfiguracion)
    expect(() => pedido(config(), { guion: "  \n" })).toThrow("vacío")
  })
})
