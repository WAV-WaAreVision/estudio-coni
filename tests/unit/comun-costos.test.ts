import { describe, expect, it } from "vitest"
import { MAXIMO_DEL_GUION } from "@/lib/dominio/revision"
import { ESTIMADO_GUION_CLAUDE_USD, ESTIMADO_POR_GUION_USD, estimarCostoVoz } from "@/lib/produccion/comun"

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

describe("ESTIMADO_POR_GUION_USD", () => {
  it("is Claude's reservation plus her voice of the longest script allowed", () => {
    expect(ESTIMADO_GUION_CLAUDE_USD).toBe(0.5)
    expect(ESTIMADO_POR_GUION_USD).toBe(0.5 + estimarCostoVoz("x".repeat(MAXIMO_DEL_GUION)))
    expect(ESTIMADO_POR_GUION_USD).toBe(1.1)
  })
})
