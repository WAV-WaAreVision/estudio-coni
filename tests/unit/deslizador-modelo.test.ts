import { describe, expect, it } from "vitest"
import { apruebaAlSoltar, progresoDeArrastre, UMBRAL_DE_APROBACION } from "@/lib/diseno/deslizador"

describe("slider model", () => {
  it("follows the finger 1 to 1 over the free travel", () => {
    expect(progresoDeArrastre({ inicioX: 10, actualX: 160, recorrido: 300 })).toBe(50)
  })
  it("clamps to 0 and 100", () => {
    expect(progresoDeArrastre({ inicioX: 100, actualX: 0, recorrido: 300 })).toBe(0)
    expect(progresoDeArrastre({ inicioX: 0, actualX: 999, recorrido: 300 })).toBe(100)
  })
  it("never divides by a zero travel", () => {
    expect(progresoDeArrastre({ inicioX: 0, actualX: 50, recorrido: 0 })).toBe(0)
  })
  it("approves only from 96 percent, on release", () => {
    expect(UMBRAL_DE_APROBACION).toBe(96)
    expect(apruebaAlSoltar(95.9)).toBe(false)
    expect(apruebaAlSoltar(96)).toBe(true)
  })
})
