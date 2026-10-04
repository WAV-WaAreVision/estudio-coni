// @vitest-environment node
import { describe, expect, it } from "vitest"
import { huellaDeVoz } from "@/lib/dominio/voz"
import { huellaDelGuion, vozDe } from "@/lib/produccion/voz"
import type { ConfigElevenlabs } from "@/lib/proveedores/config"

const V2: ConfigElevenlabs = {
  voice_id: "voz-coni",
  model_id: "eleven_multilingual_v2",
  voice_settings: { stability: 0.5 },
  output_format: "mp3_44100_128",
}
const V4: ConfigElevenlabs = { ...V2, model_id: "eleven_v4" }
const SIN = "Hola, tú.\n\nSoy Coni del Rosario."
const CON = "[warm] Hola, tú.\n\nSoy Coni del Rosario."

describe("huellaDelGuion", () => {
  it("keeps the fingerprint of a script without marks exactly as before, so stored takes still match", () => {
    expect(huellaDelGuion(SIN, V4)).toBe(huellaDeVoz({ guion: SIN, voz: vozDe(V4) }))
    expect(huellaDelGuion(SIN, V2)).toBe(huellaDeVoz({ guion: SIN, voz: vozDe(V2) }))
  })

  it("hashes the text without marks for a model that cannot speak them", () => {
    expect(huellaDelGuion(CON, V2)).toBe(huellaDelGuion(SIN, V2))
  })

  it("hashes the marks for a model that speaks them", () => {
    expect(huellaDelGuion(CON, V4)).not.toBe(huellaDelGuion(SIN, V4))
    expect(huellaDelGuion(CON, V4)).toBe(huellaDeVoz({ guion: CON, voz: vozDe(V4) }))
  })

  it("ignores an unknown mark, which never reaches the voice", () => {
    expect(huellaDelGuion("[cálido] Hola, tú.\n\nSoy Coni del Rosario.", V4)).toBe(huellaDelGuion(SIN, V4))
  })

  it("never shares a take between models", () => {
    expect(huellaDelGuion(CON, V2)).not.toBe(huellaDelGuion(CON, V4))
  })
})
