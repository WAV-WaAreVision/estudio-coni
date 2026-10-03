import { describe, expect, it } from "vitest"
import { estimarCostoRestante, UMBRAL_CONFIRMACION_USD } from "@/lib/ingesta/procesar"

const parte = (texto: string) => ({ texto, ubicacion: { pagina: 1 } })

describe("estimarCostoRestante", () => {
  it("prices the adaptation with Sonnet and the card with Opus when the whole text is in English", () => {
    // Adaptation: 10k tokens + 3 batches of 3k fixed in, 16k out, at 2 and 10 USD per million = 0.198.
    // Card: 10k + 1.5k tokens in at 4, 2.5k out at 20 = 0.096.
    expect(estimarCostoRestante([parte("a".repeat(30_000))], "en")).toBeCloseTo(0.294, 4)
  })

  it("prices only the card when the Spanish has nothing to adapt", () => {
    const texto = "Hola, vamos a hablar de lo que cada persona necesita. ".repeat(100)
    expect(estimarCostoRestante([parte(texto)], "es")).toBeCloseTo(
      (Math.ceil(texto.length / 3) + 1_500) * (4 / 1_000_000) + 2_500 * (20 / 1_000_000),
      4,
    )
  })

  it("prices the adaptation only for the parts that carry markers of another Spanish", () => {
    const limpia = parte("Hola, vamos a hablar de lo que cada persona necesita. ".repeat(100))
    const conMarcas = parte("Vosotros tenéis que coger el ordenador. ")
    const soloLimpia = estimarCostoRestante([limpia], "es")
    const conAmbas = estimarCostoRestante([limpia, conMarcas], "es")
    const soloMarcada = estimarCostoRestante([conMarcas], "es")
    expect(conAmbas).toBeGreaterThan(soloLimpia)
    expect(conAmbas - soloLimpia).toBeLessThan(0.02)
    expect(soloMarcada).toBeGreaterThan(0)
  })

  it("caps the card at 120k characters but not the adaptation", () => {
    const enorme = [parte("a".repeat(500_000))]
    const cuarenta = (120_000 / 3 + 1_500) * (4 / 1_000_000) + 2_500 * (20 / 1_000_000)
    const adaptacion = (500_000 / 3 + 3_000 * 42) * (2 / 1_000_000) + Math.ceil((500_000 / 3) * 1.6) * (10 / 1_000_000)
    expect(estimarCostoRestante(enorme, "en")).toBeCloseTo(cuarenta + adaptacion, 3)
  })

  it("treats an unknown language as needing the adaptation of every part", () => {
    expect(estimarCostoRestante([parte("a".repeat(30_000))], null)).toBeCloseTo(0.294, 4)
  })

  it("starts asking for confirmation above half a dollar", () => {
    expect(UMBRAL_CONFIRMACION_USD).toBe(0.5)
  })
})
