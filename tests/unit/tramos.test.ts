import { describe, expect, it } from "vitest"
import type { Parte } from "@/lib/ingesta/partes"
import { aTramos, CARACTERES_POR_TRAMO, trocear } from "@/lib/ingesta/tramos"

const SEPARADOR = "\n\n"

function unir(trozos: ReturnType<typeof trocear>): string {
  return trozos.map((t) => t.antes + t.texto).join("")
}

describe("trocear", () => {
  it("returns a single chunk when the text fits the limit", () => {
    expect(trocear("hola", 10)).toEqual([{ texto: "hola", antes: "" }])
  })

  it("puts the text back together exactly when it is split at paragraphs", () => {
    const texto = `${"a".repeat(30)}\n\n${"b".repeat(30)}\n\n${"c".repeat(30)}`
    const trozos = trocear(texto, 40)
    expect(trozos.length).toBeGreaterThan(1)
    expect(trozos.every((t) => t.texto.length <= 40)).toBe(true)
    expect(unir(trozos)).toBe(texto)
  })

  it("hard-cuts a text with no paragraph or sentence break", () => {
    const texto = "x".repeat(25)
    const trozos = trocear(texto, 10)
    expect(trozos.map((t) => t.texto.length)).toEqual([10, 10, 5])
    expect(unir(trozos)).toBe(texto)
  })
})

describe("aTramos", () => {
  const parte = (texto: string, pagina: number): Parte => ({ texto, ubicacion: { pagina } })

  it("returns no chunks for no parts", () => {
    expect(aTramos([])).toEqual([])
  })

  it("keeps every character exactly once when the parts fit one chunk", () => {
    const partes = [parte("uno", 1), parte("dos", 2), parte("tres", 3)]
    const tramos = aTramos(partes)
    expect(tramos).toEqual([{ numero: 0, texto: ["uno", "dos", "tres"].join(SEPARADOR), ubicacion: { pagina: 1 } }])
  })

  it("never exceeds the limit and keeps every character exactly once across chunks", () => {
    const partes = Array.from({ length: 12 }, (_, i) => parte(String.fromCharCode(97 + i).repeat(5_000), i + 1))
    const tramos = aTramos(partes)
    expect(tramos.length).toBeGreaterThan(1)
    expect(tramos.every((t) => t.texto.length <= CARACTERES_POR_TRAMO)).toBe(true)
    const todo = tramos.map((t) => t.texto).join("")
    for (let i = 0; i < 12; i++) {
      const letra = String.fromCharCode(97 + i)
      expect(todo.split(letra).length - 1).toBe(5_000)
    }
  })

  it("splits a single part longer than the limit without losing characters", () => {
    const largo = "z".repeat(CARACTERES_POR_TRAMO * 2 + 7)
    const tramos = aTramos([parte(largo, 4)])
    expect(tramos.map((t) => t.texto).join("")).toBe(largo)
    expect(tramos.every((t) => t.texto.length <= CARACTERES_POR_TRAMO)).toBe(true)
    expect(tramos.every((t) => JSON.stringify(t.ubicacion) === JSON.stringify({ pagina: 4 }))).toBe(true)
  })

  it("numbers chunks from zero and keeps the first location of each one", () => {
    const partes = [parte("a".repeat(7_000), 1), parte("b".repeat(7_000), 2), parte("c".repeat(7_000), 3)]
    const tramos = aTramos(partes)
    expect(tramos.map((t) => t.numero)).toEqual([0, 1, 2])
    expect(tramos.map((t) => t.ubicacion)).toEqual([{ pagina: 1 }, { pagina: 2 }, { pagina: 3 }])
  })

  it("is deterministic", () => {
    const partes = Array.from({ length: 8 }, (_, i) => parte(`${i}`.repeat(4_000), i))
    expect(aTramos(partes)).toEqual(aTramos(partes))
  })

  it("skips parts with no text", () => {
    expect(aTramos([parte("   ", 1), parte("", 2)])).toEqual([])
  })
})
