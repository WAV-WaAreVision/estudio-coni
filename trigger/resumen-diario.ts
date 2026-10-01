import { schedules } from "@trigger.dev/sdk"
import { enviarResumenDelDia } from "@/lib/avisos/resumen"
import { depsFalla, depsResumen } from "@/lib/produccion/deps-reales"
import { alFallarDeTarea } from "@/lib/produccion/fallas"

/**
 * 08:30 in Chile whatever the daylight saving time (design A9): the one summary of the day. The default retries stay: a
 * run that could not send leaves the notices unsent, so a retry (or tomorrow's run) carries them; and if the run is
 * lost for good, `onFailure` tells WAV, as it does for every task.
 */
export const CONFIGURACION_RESUMEN = {
  id: "resumen-diario",
  cron: { pattern: "30 8 * * *", timezone: "America/Santiago" },
  queue: { concurrencyLimit: 1 },
} as const

export const resumenDiarioTask = schedules.task({
  ...CONFIGURACION_RESUMEN,
  onFailure: alFallarDeTarea("resumen-diario", depsFalla),
  run: async () => enviarResumenDelDia(depsResumen()),
})
