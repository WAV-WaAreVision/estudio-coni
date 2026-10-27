// @vitest-environment node
import { describe, expect, it } from "vitest"
import { armarCarruselTask, CONFIGURACION_ARMAR, ENTRADA_DE_ARMAR } from "../../trigger/armar-carrusel"

describe("armarCarruselTask", () => {
  it("loads with the id the app and the sweep trigger", () => {
    expect(armarCarruselTask.id).toBe("armar-carrusel")
  })

  it("runs on medium-1x, one at a time, and retries twice (plan amendment 8, decision P8)", () => {
    expect(CONFIGURACION_ARMAR.machine).toBe("medium-1x")
    expect(CONFIGURACION_ARMAR.queue).toEqual({ concurrencyLimit: 1 })
    expect(CONFIGURACION_ARMAR.retry.maxAttempts).toBe(3)
  })

  it("takes the piece id only", () => {
    const piezaId = "11111111-2222-4333-8444-555555555555"
    expect(ENTRADA_DE_ARMAR.parse({ piezaId })).toEqual({ piezaId })
    expect(ENTRADA_DE_ARMAR.safeParse({ piezaId: "x" }).success).toBe(false)
  })
})
