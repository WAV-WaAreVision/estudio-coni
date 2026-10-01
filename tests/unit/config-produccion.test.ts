import { describe, expect, it } from "vitest"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import { leerConfigProduccion } from "@/lib/proveedores/config"
import fixture from "../fixtures/coni.config.json"

type Valor = Nodo | string | number | boolean | null | undefined
interface Nodo {
  [clave: string]: Valor
}

/** A copy of the real config with each dotted path set to its value; `undefined` removes the key. */
function editar(...cambios: [ruta: string, valor: Valor][]): Nodo {
  const copia: Nodo = structuredClone(fixture)
  for (const [ruta, valor] of cambios) {
    const claves = ruta.split(".")
    const ultima = claves.pop()
    let nodo = copia
    for (const clave of claves) {
      const siguiente = nodo[clave]
      if (typeof siguiente !== "object" || siguiente === null)
        throw new Error(`No existe ${ruta} en la ficha de prueba`)
      nodo = siguiente
    }
    if (ultima === undefined) throw new Error("Ruta vacía")
    if (valor === undefined) delete nodo[ultima]
    else nodo[ultima] = valor
  }
  return copia
}

function falla(valor: unknown): FallaDeConfiguracion {
  try {
    leerConfigProduccion(valor)
  } catch (error) {
    if (error instanceof FallaDeConfiguracion) return error
    throw error
  }
  throw new Error("Se esperaba una FallaDeConfiguracion")
}

describe("leerConfigProduccion", () => {
  it("reads the real config of Coni: Ruta B, avatar_v, reference look, no HeyGen voice", () => {
    const config = leerConfigProduccion(fixture)
    expect(config.ruta_voz).toBe("elevenlabs")
    expect(config.heygen).toEqual({
      avatar_id: "13affb25ba2d4273b0a63d82c8b9fd5a",
      voice_id: null,
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
      motor: "avatar_v",
      referencia_movimiento: "f6d7ea2438514719b6b76e0b743fa7d3",
    })
    expect(config.elevenlabs).toEqual({
      voice_id: "F2SkAeaaVSlAUrRS3rDg",
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true, speed: 1 },
      output_format: "mp3_44100_128",
    })
  })

  it("ignores keys that start with an underscore, inside strict objects too", () => {
    const config = leerConfigProduccion(
      editar(["heygen.ajustes_elevenlabs._nota", "texto libre"], ["elevenlabs.voice_settings._nota", "texto libre"]),
    )
    expect(config.heygen.ajustes_elevenlabs).not.toHaveProperty("_nota")
    expect(config.elevenlabs.voice_settings).not.toHaveProperty("_nota")
  })

  it("ignores keys that start with an underscore at the top level, in heygen and in elevenlabs", () => {
    const config = leerConfigProduccion(
      editar(["_nueva", "nota"], ["heygen._nueva", "nota"], ["elevenlabs._nueva", "nota"]),
    )
    expect(config).not.toHaveProperty("_nueva")
    expect(config.heygen).not.toHaveProperty("_nueva")
    expect(config.elevenlabs).not.toHaveProperty("_nueva")
  })

  it("rejects an unknown key at the top level, naming the key and not its value", () => {
    const error = falla(editar(["ruta_vos", "valor-escrito-por-error"]))
    expect(error.message).toContain("ruta_vos")
    expect(error.message).not.toContain("valor-escrito-por-error")
  })

  it("rejects a misspelled key inside heygen instead of silently dropping the setting", () => {
    const error = falla(
      editar(
        ["heygen.ajustes_elevenlabs", undefined],
        ["heygen.ajuste_elevenlabs", { model: "valor-escrito-por-error" }],
      ),
    )
    expect(error.message).toContain("heygen.ajuste_elevenlabs")
    expect(error.message).not.toContain("valor-escrito-por-error")
  })

  it("rejects an unknown key inside elevenlabs, naming the key and not its value", () => {
    const error = falla(editar(["elevenlabs.modelo_id", "valor-escrito-por-error"]))
    expect(error.message).toContain("elevenlabs.modelo_id")
    expect(error.message).not.toContain("valor-escrito-por-error")
  })

  it("accepts the keys of the real config that this code does not use yet, and does not expose them", () => {
    const config = leerConfigProduccion(fixture)
    expect(config).not.toMatchObject({ metricool: expect.anything() })
    expect(config.heygen).not.toMatchObject({ subtitulos_quemados: expect.anything() })
  })

  it("turns PENDIENTE, an empty string and a missing id into null", () => {
    const config = leerConfigProduccion(
      editar(
        ["heygen.avatar_id", "PENDIENTE"],
        ["heygen.voice_id", ""],
        ["heygen.referencia_movimiento", undefined],
        ["elevenlabs.voice_id", "PENDIENTE"],
      ),
    )
    expect(config.heygen.avatar_id).toBeNull()
    expect(config.heygen.voice_id).toBeNull()
    expect(config.heygen.referencia_movimiento).toBeNull()
    expect(config.elevenlabs.voice_id).toBeNull()
  })

  it("reads a missing velocidad, aspect_ratio, resolution and motor as null", () => {
    const config = leerConfigProduccion(
      editar(
        ["heygen.velocidad", undefined],
        ["heygen.aspect_ratio", undefined],
        ["heygen.resolution", undefined],
        ["heygen.motor", undefined],
        ["heygen.referencia_movimiento", undefined],
      ),
    )
    expect(config.heygen.velocidad).toBeNull()
    expect(config.heygen.aspect_ratio).toBeNull()
    expect(config.heygen.resolution).toBeNull()
    expect(config.heygen.motor).toBeNull()
  })

  it("accepts Avatar IV, a null engine and null ElevenLabs settings", () => {
    const config = leerConfigProduccion(editar(["heygen.motor", "avatar_iv"], ["heygen.ajustes_elevenlabs", null]))
    expect(config.heygen.motor).toBe("avatar_iv")
    expect(config.heygen.ajustes_elevenlabs).toBeNull()
    expect(leerConfigProduccion(editar(["heygen.motor", null])).heygen.motor).toBeNull()
  })

  it("fills the ElevenLabs defaults when the section only has the voice", () => {
    const config = leerConfigProduccion(editar(["elevenlabs", { voice_id: "voz-1" }]))
    expect(config.elevenlabs).toEqual({
      voice_id: "voz-1",
      model_id: "eleven_multilingual_v2",
      output_format: "mp3_44100_128",
    })
  })

  it("applies the ElevenLabs defaults when the section is missing", () => {
    const config = leerConfigProduccion(editar(["elevenlabs", undefined]))
    expect(config.elevenlabs).toEqual({
      voice_id: null,
      model_id: "eleven_multilingual_v2",
      output_format: "mp3_44100_128",
    })
  })

  it("treats an id made only of spaces as missing", () => {
    expect(leerConfigProduccion(editar(["heygen.avatar_id", "   "])).heygen.avatar_id).toBeNull()
  })

  it("rejects an unknown key in the HeyGen voice settings", () => {
    const error = falla(editar(["heygen.ajustes_elevenlabs.volumen", 0.3]))
    expect(error.message).toContain("heygen.ajustes_elevenlabs")
    expect(error.message).toContain("volumen")
    expect(error.message).not.toContain("0.3")
  })

  it("rejects an unknown key in the ElevenLabs voice settings", () => {
    const error = falla(editar(["elevenlabs.voice_settings.pitch", 2]))
    expect(error.message).toContain("elevenlabs.voice_settings")
    expect(error.message).toContain("pitch")
  })

  it("rejects a ruta_voz that is not exactly heygen or elevenlabs and does not echo it", () => {
    const error = falla(editar(["ruta_voz", "ElevenLabs"]))
    expect(error.message).toContain("ruta_voz")
    expect(error.message).not.toContain("ElevenLabs")
  })

  it("rejects an engine that is not avatar_iv or avatar_v and does not echo it", () => {
    const error = falla(editar(["heygen.motor", "avatar_V"]))
    expect(error.message).toContain("heygen.motor")
    expect(error.message).not.toContain("avatar_V")
  })

  it("lists every invalid path without values", () => {
    const error = falla(editar(["heygen.velocidad", "rápido"], ["elevenlabs.output_format", 128]))
    expect(error.message).toContain("heygen.velocidad")
    expect(error.message).toContain("elevenlabs.output_format")
    expect(error.message).not.toContain("rápido")
  })

  it("rejects an empty config instead of guessing a route", () => {
    const error = falla({})
    expect(error.message).toContain("ruta_voz")
    expect(error.message).toContain("heygen")
  })

  it("rejects a value that is not an object", () => {
    expect(falla(null)).toBeInstanceOf(FallaDeConfiguracion)
    expect(falla("config")).toBeInstanceOf(FallaDeConfiguracion)
  })
})
