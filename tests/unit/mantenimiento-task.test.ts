// @vitest-environment node
import { describe, expect, it } from "vitest"
import {
  CONFIGURACION_FRECUENTE,
  CONFIGURACION_NOCTURNA,
  mantenimientoFrecuenteTask,
  mantenimientoNocturnoTask,
} from "../../trigger/mantenimiento"

describe("mantenimiento tasks", () => {
  it("load with the ids the dashboard shows", () => {
    expect(mantenimientoFrecuenteTask.id).toBe("mantenimiento-frecuente")
    expect(mantenimientoNocturnoTask.id).toBe("mantenimiento-nocturno")
  })

  it("reconcile every 10 minutes (design A10)", () => {
    expect(CONFIGURACION_FRECUENTE.cron).toBe("*/10 * * * *")
    expect(CONFIGURACION_FRECUENTE.queue).toEqual({ concurrencyLimit: 1 })
  })

  it("does the rest at 03:00 America/Santiago, whatever the daylight saving time (design Q4)", () => {
    expect(CONFIGURACION_NOCTURNA.cron).toEqual({ pattern: "0 3 * * *", timezone: "America/Santiago" })
    expect(CONFIGURACION_NOCTURNA.queue).toEqual({ concurrencyLimit: 1 })
  })

  it("do not retry a run: the jobs alert on their own and the next tick is the retry", () => {
    expect(CONFIGURACION_FRECUENTE.retry).toEqual({ maxAttempts: 1 })
    expect(CONFIGURACION_NOCTURNA.retry).toEqual({ maxAttempts: 1 })
  })
})
