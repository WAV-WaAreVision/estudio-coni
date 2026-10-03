import { idempotencyKeys, schedules } from "@trigger.dev/sdk"
import { mantenimientoFrecuente, mantenimientoNocturno } from "@/lib/mantenimiento/ejecutar"
import { depsFalla, depsFrecuente, depsNocturno } from "@/lib/produccion/deps-reales"
import { alFallarDeTarea } from "@/lib/produccion/fallas"
import { grabarPiezaTask } from "./grabar-pieza"
import { producirPiezaTask } from "./producir-pieza"

// No retries on either: each job tells Coni or WAV by itself (a retry would repeat the notice), and the next tick of
// the schedule is the retry.

/** Every 10 minutes: runs the app could not start, renders that lost their callback (design A10) and reservations that outlived their run and the embeddings and links of materials left behind. */
export const CONFIGURACION_FRECUENTE = {
  id: "mantenimiento-frecuente",
  cron: "*/10 * * * *",
  queue: { concurrencyLimit: 1 },
  retry: { maxAttempts: 1 },
} as const

/** 03:00 in Chile whatever the daylight saving time (design Q4): file retention, Instagram's token and the backup. */
export const CONFIGURACION_NOCTURNA = {
  id: "mantenimiento-nocturno",
  cron: { pattern: "0 3 * * *", timezone: "America/Santiago" },
  queue: { concurrencyLimit: 1 },
  retry: { maxAttempts: 1 },
  maxDuration: 1800,
} as const

export const mantenimientoFrecuenteTask = schedules.task({
  ...CONFIGURACION_FRECUENTE,
  onFailure: alFallarDeTarea("mantenimiento-frecuente", depsFalla),
  run: async (_carga, { ctx }) =>
    mantenimientoFrecuente(
      depsFrecuente(
        async (piezaId, clave) => {
          // Global, so the key is the same whichever run (or the app) asks: one recording per piece and attempt.
          const idempotencyKey = await idempotencyKeys.create(clave, { scope: "global" })
          await grabarPiezaTask.trigger({ piezaId }, { idempotencyKey, idempotencyKeyTTL: "1d" })
        },
        async (piezaId, clave) => {
          const idempotencyKey = await idempotencyKeys.create(clave, { scope: "global" })
          await producirPiezaTask.trigger({ piezaId }, { idempotencyKey, idempotencyKeyTTL: "1d" })
        },
        ctx.run.id,
      ),
    ),
})

export const mantenimientoNocturnoTask = schedules.task({
  ...CONFIGURACION_NOCTURNA,
  onFailure: alFallarDeTarea("mantenimiento-nocturno", depsFalla),
  run: async () => mantenimientoNocturno(depsNocturno()),
})
