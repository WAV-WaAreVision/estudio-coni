import { describe, expect, it } from "vitest"
import {
  COSTO_SIN_HISTORIA_USD,
  estimarCostoDelMotor,
  RUTA_DE_SEMANA,
  textoDeCosto,
} from "@/lib/dominio/biblioteca/semana"

describe("the cost under «Proponer ahora» (4a)", () => {
  it("is the median of the latest four runs that cost something, to the cent", () => {
    expect(estimarCostoDelMotor([0.2, 0.4, 0.25, 0.3])).toBe(0.28)
    expect(estimarCostoDelMotor([0.21, 0.2, 0.25, 0.3])).toBe(0.23)
  })

  it("looks only at the latest four, newest first", () => {
    expect(estimarCostoDelMotor([0.1, 0.2, 0.3, 0.4, 9])).toBe(0.25)
  })

  it("takes the middle one of fewer than four, or the only one", () => {
    expect(estimarCostoDelMotor([0.31, 0.19, 0.22])).toBe(0.22)
    expect(estimarCostoDelMotor([0.4])).toBe(0.4)
  })

  it("ignores runs that cost nothing", () => {
    expect(estimarCostoDelMotor([0, 0.2, 0])).toBe(0.2)
  })

  it("says a fixed US$ 0,30 before any run cost something", () => {
    expect(COSTO_SIN_HISTORIA_USD).toBe(0.3)
    expect(estimarCostoDelMotor([])).toBe(0.3)
    expect(estimarCostoDelMotor([0, 0])).toBe(0.3)
  })

  it("is said in her words, under the button", () => {
    expect(textoDeCosto(0.25)).toBe("Cuesta cerca de US$ 0,25")
    expect(RUTA_DE_SEMANA).toBe("/biblioteca/semana")
  })
})
