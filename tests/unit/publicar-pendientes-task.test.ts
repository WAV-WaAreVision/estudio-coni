// @vitest-environment node
import { describe, expect, it } from "vitest"
import { CONFIGURACION_PUBLICAR, publicarPendientesTask } from "../../trigger/publicar-pendientes"

describe("publicarPendientesTask", () => {
  it("loads with the id the dashboard shows", () => {
    expect(publicarPendientesTask.id).toBe("publicar-pendientes")
  })

  it("runs every 5 minutes, one run at a time, without retrying a tick (design A3)", () => {
    expect(CONFIGURACION_PUBLICAR.cron).toBe("*/5 * * * *")
    expect(CONFIGURACION_PUBLICAR.queue).toEqual({ concurrencyLimit: 1 })
    expect(CONFIGURACION_PUBLICAR.retry).toEqual({ maxAttempts: 1 })
  })
})
