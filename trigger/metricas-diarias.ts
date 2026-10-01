import { schedules } from "@trigger.dev/sdk"
import { depsMetricas } from "@/lib/metricas/deps-reales"
import { registrarMetricasDiarias } from "@/lib/metricas/diarias"
import { depsFalla } from "@/lib/produccion/deps-reales"
import { alFallarDeTarea } from "@/lib/produccion/fallas"

/**
 * 07:00 in Chile whatever the daylight saving time (design T15). The default retries stay: reading and saving a day's
 * figures is idempotent (one row per reel per day), so a run repeated after a network failure only replaces them.
 */
export const CONFIGURACION_METRICAS = {
  id: "metricas-diarias",
  cron: { pattern: "0 7 * * *", timezone: "America/Santiago" },
  queue: { concurrencyLimit: 1 },
  // Each reel can take its 30 s timeout: sequential reads of a few dozen reels need more than ten minutes.
  maxDuration: 900,
} as const

export const metricasDiariasTask = schedules.task({
  ...CONFIGURACION_METRICAS,
  onFailure: alFallarDeTarea("metricas-diarias", depsFalla),
  run: async () => registrarMetricasDiarias(depsMetricas()),
})
