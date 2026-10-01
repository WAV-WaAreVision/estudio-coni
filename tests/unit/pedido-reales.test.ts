// @vitest-environment node
import { describe, expect, it } from "vitest"
import { armarPedido, type ConfigProduccion } from "@/lib/proveedores/heygen"

// The ruta_voz and heygen keys of coni-heygen/coni.config.json as of 2026-09-30. The IDs are not secrets.
const CONFIG_DE_CONI: ConfigProduccion = {
  ruta_voz: "elevenlabs",
  heygen: {
    avatar_id: "13affb25ba2d4273b0a63d82c8b9fd5a",
    voice_id: "PENDIENTE",
    ajustes_elevenlabs: {
      model: "eleven_multilingual_v2",
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0.0,
      use_speaker_boost: true,
    },
    velocidad: 1.0,
    aspect_ratio: "9:16",
    resolution: "1080p",
    motor: "avatar_v",
    referencia_movimiento: "f6d7ea2438514719b6b76e0b743fa7d3",
  },
}

// Ruta B bodies do not carry the script, so any non-empty one reproduces them.
const GUION = "Guion aprobado."

describe("armarPedido contra los reels reales", () => {
  it("reproduce el pedido que coni.py guardó para el reel del taller", () => {
    const { cuerpo } = armarPedido({
      config: CONFIG_DE_CONI,
      guion: GUION,
      titulo: "Coni · 2026-09-25-taller-propia-diosa",
      audioAssetId: "fc40366e87b743b99143922fd262fd94",
      avatarId: "13affb25ba2d4273b0a63d82c8b9fd5a",
    })
    expect(cuerpo).toEqual({
      type: "avatar",
      avatar_id: "13affb25ba2d4273b0a63d82c8b9fd5a",
      title: "Coni · 2026-09-25-taller-propia-diosa",
      aspect_ratio: "9:16",
      caption: { file_format: "srt" },
      resolution: "1080p",
      engine: { type: "avatar_v", reference_look_id: "f6d7ea2438514719b6b76e0b743fa7d3" },
      audio_asset_id: "fc40366e87b743b99143922fd262fd94",
    })
  })

  it("reproduce el pedido que coni.py guardó para el reel del deseo, con otro look", () => {
    const { cuerpo } = armarPedido({
      config: CONFIG_DE_CONI,
      guion: GUION,
      titulo: "Coni · 2026-09-30-deseo-se-esconde",
      audioAssetId: "7300845dd5ec46a09e2abfe7e18a2b1e",
      avatarId: "6cab495d375942f49f39f519f269d935",
    })
    expect(cuerpo).toEqual({
      type: "avatar",
      avatar_id: "6cab495d375942f49f39f519f269d935",
      title: "Coni · 2026-09-30-deseo-se-esconde",
      aspect_ratio: "9:16",
      caption: { file_format: "srt" },
      resolution: "1080p",
      engine: { type: "avatar_v", reference_look_id: "f6d7ea2438514719b6b76e0b743fa7d3" },
      audio_asset_id: "7300845dd5ec46a09e2abfe7e18a2b1e",
    })
  })
})
