// @vitest-environment node
import { describe, expect, it } from "vitest"
import {
  distanciaHamming,
  hashesDeMuestra,
  intervaloDeMuestreo,
  MAXIMO_FOTOGRAMAS,
  unirLineasDePantalla,
} from "@/lib/ingesta/fotogramas"

/** A 9x16 gray sample (bottom band on top of the full frame) where every row is `fila(x)`. */
function muestra(fila: (x: number) => number): Uint8Array {
  return Uint8Array.from({ length: 144 }, (_, i) => fila(i % 9))
}

describe("hashesDeMuestra", () => {
  it("gives the same hashes to equal samples and 0 distance", () => {
    const a = hashesDeMuestra(muestra((x) => x * 20))
    const b = hashesDeMuestra(muestra((x) => x * 20))
    expect(distanciaHamming(a.franja, b.franja)).toBe(0)
    expect(distanciaHamming(a.completo, b.completo)).toBe(0)
  })

  it("sets a bit for every pixel brighter than its right neighbour", () => {
    const creciente = hashesDeMuestra(muestra((x) => x * 20))
    const decreciente = hashesDeMuestra(muestra((x) => 200 - x * 20))
    expect(creciente.franja).toBe("0".repeat(64))
    expect(decreciente.franja).toBe("1".repeat(64))
    expect(distanciaHamming(creciente.franja, decreciente.franja)).toBe(64)
  })

  it("rejects a sample that is not 9x16 bytes", () => {
    expect(() => hashesDeMuestra(new Uint8Array(10))).toThrow(/144/)
  })
})

describe("unirLineasDePantalla", () => {
  it("merges consecutive identical lines into one span", () => {
    expect(
      unirLineasDePantalla([
        { segundo: 0, texto: "Hola soy Coni" },
        { segundo: 1, texto: "Hola soy Coni" },
        { segundo: 2, texto: "Hablemos de límites" },
      ]),
    ).toEqual([
      { desde: 0, hasta: 1, texto: "Hola soy Coni" },
      { desde: 2, hasta: 2, texto: "Hablemos de límites" },
    ])
  })

  it("treats case, spacing and punctuation differences as the same line", () => {
    expect(
      unirLineasDePantalla([
        { segundo: 0, texto: "Hola, soy Coni." },
        { segundo: 1, texto: "  hola soy   CONI " },
      ]),
    ).toEqual([{ desde: 0, hasta: 1, texto: "Hola, soy Coni." }])
  })

  it("skips empty texts and does not bridge a gap between equal lines", () => {
    expect(
      unirLineasDePantalla([
        { segundo: 0, texto: "Gracias" },
        { segundo: 1, texto: "" },
        { segundo: 2, texto: "   " },
        { segundo: 3, texto: "Gracias" },
      ]),
    ).toEqual([
      { desde: 0, hasta: 0, texto: "Gracias" },
      { desde: 3, hasta: 3, texto: "Gracias" },
    ])
  })

  it("merges near-identical lines such as one OCR typo", () => {
    expect(
      unirLineasDePantalla([
        { segundo: 0, texto: "Hablemos de limites en pareja" },
        { segundo: 1, texto: "Hablemos de limltes en pareja" },
      ]),
    ).toHaveLength(1)
  })

  it("keeps different lines apart even if they share a word", () => {
    expect(
      unirLineasDePantalla([
        { segundo: 0, texto: "Hola soy Coni" },
        { segundo: 1, texto: "Hola, bienvenida" },
      ]),
    ).toHaveLength(2)
  })
})

describe("intervaloDeMuestreo", () => {
  it("keeps the requested interval for a short video", () => {
    expect(intervaloDeMuestreo(6, 1)).toBe(1)
    expect(intervaloDeMuestreo(MAXIMO_FOTOGRAMAS, 1)).toBe(1)
  })

  it("widens the interval so a long video yields at most the maximum frames", () => {
    expect(intervaloDeMuestreo(MAXIMO_FOTOGRAMAS + 1, 1)).toBe(2)
    expect(intervaloDeMuestreo(3600, 1)).toBe(6)
    expect(3600 / intervaloDeMuestreo(3600, 1)).toBeLessThanOrEqual(MAXIMO_FOTOGRAMAS)
  })

  it("never goes below the requested interval", () => {
    expect(intervaloDeMuestreo(10, 5)).toBe(5)
  })
})
