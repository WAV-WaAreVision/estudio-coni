import { describe, expect, it } from "vitest"
import type { Lamina } from "@/lib/dominio/carrusel"
import {
  aplicarCambioDeDiseno,
  DISENO_INICIAL,
  DisenoInvalido,
  frasesDe,
  leerDiseno,
  palabrasDestacables,
  puedeDividir,
  puedeUnir,
} from "@/lib/dominio/diseno-carrusel"
import { hashTextoDeCarrusel } from "@/lib/dominio/puertas"
import { LAMINAS_DE_PRUEBA, TEXTO_POST_DE_PRUEBA } from "../fixtures/carrusel"

const hash = (laminas: readonly Lamina[]) => hashTextoDeCarrusel({ laminas, textoPost: TEXTO_POST_DE_PRUEBA })
const original = hash(LAMINAS_DE_PRUEBA)

describe("frasesDe", () => {
  it("splits after a sentence's end and keeps the punctuation", () => {
    expect(frasesDe("Un chatbot te responde. Eso ayuda, pero no te conoce.")).toEqual([
      "Un chatbot te responde.",
      "Eso ayuda, pero no te conoce.",
    ])
    expect(frasesDe("Una sola idea sin punto")).toEqual(["Una sola idea sin punto"])
  })
})

describe("aplicarCambioDeDiseno", () => {
  it("changes the variant and nothing else", () => {
    const { laminas, diseno } = aplicarCambioDeDiseno(LAMINAS_DE_PRUEBA, DISENO_INICIAL, {
      tipo: "variante",
      variante: "oscura",
    })
    expect(diseno).toEqual({ variante: "oscura" })
    expect(laminas).toEqual(LAMINAS_DE_PRUEBA)
  })

  it("splits an idea at the sentence boundary nearest its middle, keeping words, order and the hash", () => {
    const { laminas } = aplicarCambioDeDiseno(LAMINAS_DE_PRUEBA, DISENO_INICIAL, { tipo: "dividir", lamina: 1 })
    expect(laminas).toHaveLength(LAMINAS_DE_PRUEBA.length + 1)
    expect(laminas[1]).toEqual({ tipo: "idea", texto: "Un chatbot te responde a cualquier hora." })
    expect(laminas[2]).toEqual({ tipo: "idea", texto: "Eso ayuda, pero no te conoce." })
    expect(hash(laminas)).toBe(original)
  })

  it("merges two adjacent ideas keeping the first highlight, words, order and the hash", () => {
    // The fixture has four ideas, the minimum: split one first so a merge is allowed.
    const cinco = aplicarCambioDeDiseno(LAMINAS_DE_PRUEBA, DISENO_INICIAL, { tipo: "dividir", lamina: 1 }).laminas
    const { laminas } = aplicarCambioDeDiseno(cinco, DISENO_INICIAL, { tipo: "unir", lamina: 3 })
    expect(laminas).toHaveLength(LAMINAS_DE_PRUEBA.length)
    expect(laminas[3]).toEqual({
      tipo: "idea",
      texto:
        "No nota el silencio largo antes de una respuesta difícil. No ve cómo cambia tu voz cuando hablas de tu familia.",
      destacado: "silencio",
    })
    expect(hash(laminas)).toBe(original)
  })

  it("highlights one of the slide's own words, or none, keeping the hash", () => {
    const con = aplicarCambioDeDiseno(LAMINAS_DE_PRUEBA, DISENO_INICIAL, {
      tipo: "destacar",
      lamina: 1,
      palabra: "conoce",
    })
    expect(con.laminas[1]?.destacado).toBe("conoce")
    const sin = aplicarCambioDeDiseno(LAMINAS_DE_PRUEBA, DISENO_INICIAL, { tipo: "destacar", lamina: 2, palabra: null })
    expect(sin.laminas[2]).toEqual({ tipo: "idea", texto: "No nota el silencio largo antes de una respuesta difícil." })
    expect(hash(con.laminas)).toBe(original)
    expect(() =>
      aplicarCambioDeDiseno(LAMINAS_DE_PRUEBA, DISENO_INICIAL, { tipo: "destacar", lamina: 1, palabra: "ajena" }),
    ).toThrow(DisenoInvalido)
  })

  it("never splits a one-sentence slide, the portada or past six ideas, nor merges across portada or cierre or under four", () => {
    const [portada, , , , , cierre] = LAMINAS_DE_PRUEBA
    if (!portada || !cierre) throw new Error("La lámina de prueba cambió de forma.")
    expect(puedeDividir(LAMINAS_DE_PRUEBA, 2)).toBe(false)
    expect(puedeDividir(LAMINAS_DE_PRUEBA, 0)).toBe(false)
    expect(puedeUnir(LAMINAS_DE_PRUEBA, 0)).toBe(false)
    expect(puedeUnir(LAMINAS_DE_PRUEBA, 4)).toBe(false)
    expect(puedeUnir(LAMINAS_DE_PRUEBA, 1)).toBe(false)
    expect(() => aplicarCambioDeDiseno(LAMINAS_DE_PRUEBA, DISENO_INICIAL, { tipo: "unir", lamina: 1 })).toThrow(
      DisenoInvalido,
    )
    const seis: Lamina[] = [
      portada,
      ...Array.from({ length: 6 }, (_, i): Lamina => ({ tipo: "idea", texto: `Primera ${i}. Segunda ${i}.` })),
      cierre,
    ]
    expect(puedeDividir(seis, 1)).toBe(false)
  })

  it("lists the words a slide can highlight, once each", () => {
    expect(palabrasDestacables({ tipo: "idea", texto: "No ve, no ve cómo cambia tu voz." })).toEqual([
      "No",
      "ve",
      "no",
      "cómo",
      "cambia",
      "tu",
      "voz",
    ])
  })
})

describe("leerDiseno", () => {
  it("reads a stored design and refuses anything else", () => {
    expect(leerDiseno({ variante: "piedra" })).toEqual({ variante: "piedra" })
    expect(() => leerDiseno({ variante: "neon" })).toThrow(Error)
  })
})
