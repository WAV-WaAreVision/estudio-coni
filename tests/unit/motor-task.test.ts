// @vitest-environment node
import { describe, expect, it } from "vitest"
import { domingoDeSemana } from "@/lib/motor/semana"
import { ejecutarMotorSemanal } from "@/lib/motor/tarea"
import { COLA_DEL_MOTOR, CONFIGURACION_MOTOR, motorManualTask, motorSemanalTask } from "../../trigger/motor-semanal"

describe("motorSemanalTask", () => {
  it("loads with the id the dashboard shows", () => {
    expect(motorSemanalTask.id).toBe("motor-semanal")
  })

  it("runs every Sunday at 20:00 in Santiago whatever the daylight saving time, one run at a time, for ten minutes at most", () => {
    expect(CONFIGURACION_MOTOR.cron).toEqual({ pattern: "0 20 * * 0", timezone: "America/Santiago" })
    expect(CONFIGURACION_MOTOR.queue).toBe(COLA_DEL_MOTOR)
    expect(CONFIGURACION_MOTOR.maxDuration).toBe(600)
  })

  it("shares one queue of one run with the manual task, so they never overlap", () => {
    expect(motorManualTask.id).toBe("motor-manual")
    expect(COLA_DEL_MOTOR.concurrencyLimit).toBe(1)
  })
})

describe("domingoDeSemana", () => {
  it("is the same day when the date is a Sunday in Santiago", () => {
    expect(domingoDeSemana(new Date("2026-10-05T00:00:00Z"))).toBe("2026-10-04")
  })

  it("is the coming Sunday when the date is a Wednesday", () => {
    expect(domingoDeSemana(new Date("2026-10-07T15:00:00Z"))).toBe("2026-10-11")
  })

  it("is the next day on a Saturday night in Santiago, even when UTC is already Sunday", () => {
    // 2026-10-03 23:30 in Santiago (UTC-3) is 2026-10-04 02:30 UTC.
    expect(domingoDeSemana(new Date("2026-10-04T02:30:00Z"))).toBe("2026-10-04")
  })

  it("stays on the previous Sunday's week on a Sunday night in Santiago, even when UTC is already Monday", () => {
    // 2026-10-04 22:00 in Santiago is 2026-10-05 01:00 UTC.
    expect(domingoDeSemana(new Date("2026-10-05T01:00:00Z"))).toBe("2026-10-04")
  })
})

describe("ejecutarMotorSemanal", () => {
  it("is skipped, without touching anything, when Coni has not entered Claude's key yet", async () => {
    const resultado = await ejecutarMotorSemanal({ timestamp: new Date("2026-10-04T23:00:00Z") }, async () => null)

    expect(resultado).toEqual({ omitido: true })
  })
})
