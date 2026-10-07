// @vitest-environment node
import { describe, expect, it } from "vitest"
import { filaDeCuenta } from "@/lib/ajustes/presentar"

const AHORA = Date.parse("2031-01-01T12:00:00Z")

describe("filaDeCuenta for LinkedIn", () => {
  it("handles a not connected LinkedIn: reads A mano, neutral, never Falta", () => {
    expect(filaDeCuenta({ cuenta: "linkedin", estado: "falta" }, AHORA)).toMatchObject({
      estado: "A mano",
      tono: "neutro",
    })
  })

  it("shows who it publishes as when connected", () => {
    expect(filaDeCuenta({ cuenta: "linkedin", estado: "lista", nombre: "Coni del Rosario" }, AHORA)).toMatchObject({
      estado: "Conectada",
      detalle: "Publica como Coni del Rosario",
      conectada: true,
    })
  })
})
