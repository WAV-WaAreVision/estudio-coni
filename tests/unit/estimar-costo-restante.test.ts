import { describe, expect, it } from "vitest"
import {
  ESTIMADO_POR_TRAMO_USD,
  estimarCostoRestante,
  estimarFicha,
  UMBRAL_CONFIRMACION_USD,
} from "@/lib/ingesta/procesar"

const parte = (texto: string) => ({ texto, ubicacion: { pagina: 1 } })
const parrafo = "Hablar de lo que cada persona necesita ayuda a la pareja. ".repeat(88)

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

  it("starts asking for confirmation above one dollar", () => {
    expect(UMBRAL_CONFIRMACION_USD).toBe(1)
  })
})
