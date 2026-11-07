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
  // 3 batches of at most 180 s each (CLAUDE_ESPERA_MOTOR_MS) plus the reads and writes: 600 s left no margin.
  maxDuration: 900,
} as const

export const motorSemanalTask = schedules.task({
  ...CONFIGURACION_MOTOR,
  catchError: ({ error }) => decisionDeReintento(error),
  onFailure: alFallarDeTarea("motor-semanal", depsFalla),
  run: async (payload) => ejecutarMotorSemanal({ manual: false, timestamp: payload.timestamp }, depsMotor),
})

/** `semana` is optional so a run triggered by the app before it sent the week still starts. */
export const ENTRADA_MOTOR_MANUAL = z.object({
  manual: z.literal(true).optional(),
  semana: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
})

/** "Proponer ahora": a plain task, because the scheduled one is typed with the schedule's payload. */
export const motorManualTask = schemaTask({
  id: "motor-manual",
  schema: ENTRADA_MOTOR_MANUAL,
  queue: COLA_DEL_MOTOR,
  maxDuration: CONFIGURACION_MOTOR.maxDuration,
  catchError: ({ error }) => decisionDeReintento(error),
  onFailure: alFallarDeTarea("motor-manual", depsFalla),
  run: async ({ semana }) => ejecutarMotorSemanal({ manual: true, semana }, depsMotor),
})
