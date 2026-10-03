// @vitest-environment node
import { describe, expect, it } from "vitest"
import {
  COLA_DE_MANTENIMIENTO,
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
  })

  it("share one queue of one run at a time, so topics never form and merge together", () => {
    expect(COLA_DE_MANTENIMIENTO.concurrencyLimit).toBe(1)
    expect(CONFIGURACION_FRECUENTE.queue).toBe(COLA_DE_MANTENIMIENTO)
    expect(CONFIGURACION_NOCTURNA.queue).toBe(COLA_DE_MANTENIMIENTO)
  })

  it("does the rest at 03:00 America/Santiago, whatever the daylight saving time (design Q4)", () => {
    expect(CONFIGURACION_NOCTURNA.cron).toEqual({ pattern: "0 3 * * *", timezone: "America/Santiago" })
  })

  it("do not retry a run: the jobs alert on their own and the next tick is the retry", () => {
    expect(CONFIGURACION_FRECUENTE.retry).toEqual({ maxAttempts: 1 })
    expect(CONFIGURACION_NOCTURNA.retry).toEqual({ maxAttempts: 1 })
  })
})
