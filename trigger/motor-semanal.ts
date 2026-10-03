import { schedules } from "@trigger.dev/sdk"
import { type EntradaDelMotor, ejecutarMotorSemanal } from "@/lib/motor/tarea"
import { depsFalla, depsMotor } from "@/lib/produccion/deps-reales"
import { alFallarDeTarea } from "@/lib/produccion/fallas"
import { decisionDeReintento } from "@/lib/produccion/reintentos"

/**
 * Sunday 20:00 in Chile whatever the daylight saving time. One run at a time. The run is keyed by week in
 * `motor_corridas`, so a retry or a second trigger never proposes twice.
 */
export const CONFIGURACION_MOTOR = {
  id: "motor-semanal",
  cron: { pattern: "0 20 * * 0", timezone: "America/Santiago" },
  queue: { concurrencyLimit: 1 },
  maxDuration: 600,
} as const

export const motorSemanalTask = schedules.task({
  ...CONFIGURACION_MOTOR,
  catchError: ({ error }) => decisionDeReintento(error),
  onFailure: alFallarDeTarea("motor-semanal", depsFalla),
  // "Proponer ahora" triggers the task by hand with `{ manual: true }` and no schedule timestamp.
  run: async (payload) => ejecutarMotorSemanal(payload as EntradaDelMotor, depsMotor),
})
