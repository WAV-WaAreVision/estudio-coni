import { describe, expect, test } from "vitest"
import { contarPalabras, estadoDeLargo, estimarSegundos } from "@/lib/dominio/duracion"

describe("script length", () => {
  test("counts words across paragraphs and ignores extra spaces", () => {
    expect(contarPalabras("Hola  tú.\n\nAsí es.")).toBe(4)
  })
  test("an empty or blank text has zero words", () => {
    expect(contarPalabras("   \n ")).toBe(0)
  })
  test("estimates seconds with the same formula as the costs", () => {
    expect(estimarSegundos("palabra ".repeat(100))).toBeCloseTo(40, 9)
  })
  test("adds a pause for each paragraph break", () => {
    expect(estimarSegundos("palabra ".repeat(100).trim() + "\n\nfin")).toBeCloseTo((101 / 150) * 60 + 0.6, 9)
  })
  test("flags short, ok and long against the 75 to 150 word target", () => {
    expect(estadoDeLargo(60)).toBe("corto")
    expect(estadoDeLargo(75)).toBe("bien")
    expect(estadoDeLargo(150)).toBe("bien")
    expect(estadoDeLargo(160)).toBe("largo")
  })
})
