// @vitest-environment node
import { describe, expect, it } from "vitest"
import { CONFIGURACION_RESUMEN, resumenDiarioTask } from "../../trigger/resumen-diario"

describe("resumen-diario task", () => {
  it("loads with the id the dashboard shows", () => {
    expect(resumenDiarioTask.id).toBe("resumen-diario")
  })

  it("runs at 08:30 America/Santiago whatever the daylight saving time (design A9)", () => {
    expect(CONFIGURACION_RESUMEN.cron).toEqual({ pattern: "30 8 * * *", timezone: "America/Santiago" })
  })

  it("runs one at a time, so two runs never both send the day's summary", () => {
    expect(CONFIGURACION_RESUMEN.queue).toEqual({ concurrencyLimit: 1 })
  })
})
