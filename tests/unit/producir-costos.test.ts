import { describe, expect, it } from "vitest"
import { estimarCostoVoz } from "@/lib/produccion/producir"

describe("estimarCostoVoz", () => {
  it("charges 0.0003 USD per character", () => {
    expect(estimarCostoVoz("a".repeat(1000))).toBe(0.3)
    expect(estimarCostoVoz("a".repeat(515))).toBe(0.1545)
  })

  it("rounds to the four decimals that gastos.estimado_usd stores", () => {
    expect(estimarCostoVoz("a".repeat(7))).toBe(0.0021)
    expect(estimarCostoVoz("a".repeat(3))).toBe(0.0009)
  })

  it("never goes below the minimum a reservation accepts, so an empty text still reserves", () => {
    expect(estimarCostoVoz("")).toBe(0.0001)
    expect(estimarCostoVoz("a")).toBe(0.0003)
  })
})
