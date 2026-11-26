import { describe, expect, it } from "vitest"
import { ESTIMADO_POR_TRAMO_USD, estimarCostoRestante, estimarFicha } from "@/lib/ingesta/procesar"

const parte = (texto: string) => ({ texto, ubicacion: { pagina: 1 } })
const parrafo = "Hablar de lo que cada persona necesita ayuda a la pareja. ".repeat(88)

// Change 6a, staging 2026-11-26: a 5.4k-char chunk with 13 claims and their marks cost US$ 0.062. A full chunk can
// carry 15 claims; the reservation keeps 50% over that.
const MEDIDO_EN_STAGING_USD = 0.062
const RESERVA_MINIMA_USD = ((MEDIDO_EN_STAGING_USD * 15) / 13) * 1.5

describe("ESTIMADO_POR_TRAMO_USD", () => {
  it("reserves above the cost measured on staging for claims with marks and hooks", () => {
    expect(ESTIMADO_POR_TRAMO_USD).toBeGreaterThanOrEqual(RESERVA_MINIMA_USD)
  })
})

describe("estimarCostoRestante", () => {
  it("prices the card alone for a strategy material", () => {
    const partes = [parte("a".repeat(30_000))]
    expect(estimarCostoRestante(partes, "estrategia")).toBeCloseTo(estimarFicha(partes), 4)
  })

  it("prices one Sonnet request per chunk, plus a small embedding reserve, for the other roles", () => {
    const partes = [parte([parrafo, parrafo, parrafo, parrafo, parrafo].join("\n\n"))]
    const costo = estimarCostoRestante(partes, "referente")
    expect(costo).toBeGreaterThanOrEqual(3 * ESTIMADO_POR_TRAMO_USD)
    expect(costo).toBeLessThan(3 * ESTIMADO_POR_TRAMO_USD + 0.01)
  })

  it("charges the same for every role that makes claims", () => {
    const partes = [parte(parrafo)]
    expect(estimarCostoRestante(partes, "evidencia")).toBe(estimarCostoRestante(partes, "referente"))
    expect(estimarCostoRestante(partes, "voz_propia")).toBe(estimarCostoRestante(partes, "referente"))
  })
})
