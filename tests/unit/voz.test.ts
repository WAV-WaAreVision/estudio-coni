// tests/unit/voz.test.ts
import { describe, expect, it } from "vitest"
import {
  claveDeToma,
  huellaDeVoz,
  prefijoDeTomas,
  ultimaToma,
  type VozConfigurada,
  vozDelGuion,
} from "@/lib/dominio/voz"
import { claveDeGastoDeVoz } from "@/lib/produccion/voz"

const PIEZA = "11111111-2222-4333-8444-555555555555"
const VOZ: VozConfigurada = {
  voiceId: "voz-coni",
  modelId: "eleven_multilingual_v2",
  outputFormat: "mp3_44100_128",
  ajustes: { stability: 0.5, similarity_boost: 0.8 },
}
const GUION = "Hola, soy Coni. Hoy hablamos de límites."

describe("huellaDeVoz", () => {
  it("is a SHA-256 that only depends on the text and what changes the audio", () => {
    const huella = huellaDeVoz({ guion: GUION, voz: VOZ })
    expect(huella).toMatch(/^[0-9a-f]{64}$/)
    expect(huellaDeVoz({ guion: GUION, voz: { ...VOZ } })).toBe(huella)
  })

  it("changes with the text, the voice, the model, the format or the settings", () => {
    const base = huellaDeVoz({ guion: GUION, voz: VOZ })
    expect(huellaDeVoz({ guion: `${GUION} `, voz: VOZ })).not.toBe(base)
    expect(huellaDeVoz({ guion: GUION, voz: { ...VOZ, voiceId: "otra" } })).not.toBe(base)
    expect(huellaDeVoz({ guion: GUION, voz: { ...VOZ, modelId: "eleven_v3" } })).not.toBe(base)
    expect(huellaDeVoz({ guion: GUION, voz: { ...VOZ, outputFormat: "mp3_22050_32" } })).not.toBe(base)
    expect(huellaDeVoz({ guion: GUION, voz: { ...VOZ, ajustes: { stability: 0.6, similarity_boost: 0.8 } } })).not.toBe(
      base,
    )
  })

  it("does not depend on the order of the settings, and treats no settings like empty ones", () => {
    const ordenada = huellaDeVoz({ guion: GUION, voz: VOZ })
    const desordenada = huellaDeVoz({
      guion: GUION,
      voz: { ...VOZ, ajustes: { similarity_boost: 0.8, stability: 0.5 } },
    })
    expect(desordenada).toBe(ordenada)
    expect(huellaDeVoz({ guion: GUION, voz: { ...VOZ, ajustes: null } })).toBe(
      huellaDeVoz({ guion: GUION, voz: { ...VOZ, ajustes: {} } }),
    )
  })
})

describe("claves de toma", () => {
  const huella = huellaDeVoz({ guion: GUION, voz: VOZ })

  it("names a take under the piece, with the fingerprint and the take number", () => {
    expect(prefijoDeTomas(PIEZA, huella)).toBe(`voces/${PIEZA}/t-${huella}-`)
    expect(claveDeToma(PIEZA, huella, 3)).toBe(`voces/${PIEZA}/t-${huella}-3.mp3`)
  })

  it("refuses a piece id that is not a UUID, a fingerprint that is not hex and a negative take", () => {
    expect(() => claveDeToma("../x", huella, 0)).toThrow()
    expect(() => claveDeToma(PIEZA, "abc", 0)).toThrow()
    expect(() => claveDeToma(PIEZA, huella, -1)).toThrow()
    expect(() => claveDeToma(PIEZA, huella, 1.5)).toThrow()
  })

  it("picks the highest take of that fingerprint and ignores anything else", () => {
    const otra = huellaDeVoz({ guion: "Otro texto.", voz: VOZ })
    const claves = [
      claveDeToma(PIEZA, huella, 2),
      claveDeToma(PIEZA, huella, 10),
      claveDeToma(PIEZA, otra, 50),
      `voces/${PIEZA}/${"a".repeat(64)}.mp3`,
      `${prefijoDeTomas(PIEZA, huella)}x.mp3`,
    ]
    expect(ultimaToma(claves, PIEZA, huella)).toBe(claveDeToma(PIEZA, huella, 10))
    expect(ultimaToma([], PIEZA, huella)).toBeNull()
  })
})

describe("vozDelGuion", () => {
  const huella = huellaDeVoz({ guion: GUION, voz: VOZ })
  const legada = `voces/${PIEZA}/${"b".repeat(64)}.mp3`

  it("accepts any take of this fingerprint and the legacy keys it is given", () => {
    expect(vozDelGuion({ audioId: claveDeToma(PIEZA, huella, 4), piezaId: PIEZA, huella })).toBe(
      claveDeToma(PIEZA, huella, 4),
    )
    expect(vozDelGuion({ audioId: legada, piezaId: PIEZA, huella, legadas: [legada] })).toBe(legada)
  })

  it("refuses no voice, a voice of another text and a legacy key it was not given", () => {
    const otra = huellaDeVoz({ guion: "Otro texto.", voz: VOZ })
    expect(vozDelGuion({ audioId: null, piezaId: PIEZA, huella })).toBeNull()
    expect(vozDelGuion({ audioId: claveDeToma(PIEZA, otra, 0), piezaId: PIEZA, huella })).toBeNull()
    expect(vozDelGuion({ audioId: legada, piezaId: PIEZA, huella })).toBeNull()
  })
})

describe("claveDeGastoDeVoz", () => {
  const HUELLA = "ab".repeat(32)

  it("keeps the attempt's own key for the first paid try and suffixes the next ones", () => {
    expect(claveDeGastoDeVoz("p1", HUELLA, 2)).toBe(`p1:voz:${"ab".repeat(8)}:2`)
    expect(claveDeGastoDeVoz("p1", HUELLA, 2, 1)).toBe(`p1:voz:${"ab".repeat(8)}:2:r1`)
  })

  it("rejects a negative or fractional paid try", () => {
    expect(() => claveDeGastoDeVoz("p1", HUELLA, 2, -1)).toThrow()
    expect(() => claveDeGastoDeVoz("p1", HUELLA, 2, 1.5)).toThrow()
  })
})
