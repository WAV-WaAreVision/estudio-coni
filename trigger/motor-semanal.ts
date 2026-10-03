import { queue, schedules, schemaTask } from "@trigger.dev/sdk"
import { z } from "zod"
import { ejecutarMotorSemanal } from "@/lib/motor/tarea"
import { depsFalla, depsMotor } from "@/lib/produccion/deps-reales"
import { alFallarDeTarea } from "@/lib/produccion/fallas"
import { decisionDeReintento } from "@/lib/produccion/reintentos"

/** One queue for both tasks: a manual run and the Sunday run never overlap. */
export const COLA_DEL_MOTOR = queue({ name: "motor", concurrencyLimit: 1 })

/**
 * Sunday 20:00 in Chile whatever the daylight saving time. The run is keyed by week in `motor_corridas`, so a retry
 * or a second trigger never proposes twice.
 */
export const CONFIGURACION_MOTOR = {
  id: "motor-semanal",
  cron: { pattern: "0 20 * * 0", timezone: "America/Santiago" },
  queue: COLA_DEL_MOTOR,
  maxDuration: 600,
} as const

export const motorSemanalTask = schedules.task({
  ...CONFIGURACION_MOTOR,
  catchError: ({ error }) => decisionDeReintento(error),
  onFailure: alFallarDeTarea("motor-semanal", depsFalla),
  run: async (payload) => ejecutarMotorSemanal({ manual: false, timestamp: payload.timestamp }, depsMotor),
})

/** "Proponer ahora": a plain task, because the scheduled one is typed with the schedule's payload. */
export const motorManualTask = schemaTask({
  id: "motor-manual",
  schema: z.object({ manual: z.literal(true).optional() }),
  queue: COLA_DEL_MOTOR,
  maxDuration: CONFIGURACION_MOTOR.maxDuration,
  catchError: ({ error }) => decisionDeReintento(error),
  onFailure: alFallarDeTarea("motor-manual", depsFalla),
  run: async () => ejecutarMotorSemanal({ manual: true }, depsMotor),
})
