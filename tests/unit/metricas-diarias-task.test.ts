// @vitest-environment node
import { describe, expect, it } from "vitest"
import { CONFIGURACION_METRICAS, metricasDiariasTask } from "../../trigger/metricas-diarias"

describe("metricasDiariasTask", () => {
  it("loads with the id the dashboard shows", () => {
    expect(metricasDiariasTask.id).toBe("metricas-diarias")
  })

  it("runs every day at 07:00 in Santiago whatever the daylight saving time, one run at a time", () => {
    expect(CONFIGURACION_METRICAS.cron).toEqual({ pattern: "0 7 * * *", timezone: "America/Santiago" })
    expect(CONFIGURACION_METRICAS.queue).toEqual({ concurrencyLimit: 1 })
  })
})
