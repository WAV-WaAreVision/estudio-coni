import { describe, expect, test } from "vitest"
import { contarPalabras, estadoDeLargo, estimarSegundos } from "@/lib/dominio/duracion"

describe("script length", () => {
  test("counts words across paragraphs and ignores extra spaces", () => {
    expect(contarPalabras("Hola  tú.\n\nAsí es.")).toBe(4)
  })
  test("an empty or blank text has zero words", () => {
    expect(contarPalabras("   \n ")).toBe(0)
  })
  test("estimates seconds at 2.5 words per second, rounded", () => {
    expect(estimarSegundos("palabra ".repeat(100))).toBe(40)
  })
  test("flags short, ok and long against the 75 to 150 word target", () => {
    expect(estadoDeLargo(60)).toBe("corto")
    expect(estadoDeLargo(75)).toBe("bien")
    expect(estadoDeLargo(150)).toBe("bien")
    expect(estadoDeLargo(160)).toBe("largo")
  })
})
