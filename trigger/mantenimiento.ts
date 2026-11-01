import { idempotencyKeys, queue, schedules } from "@trigger.dev/sdk"
import { mantenimientoFrecuente, mantenimientoNocturno } from "@/lib/mantenimiento/ejecutar"
import { depsFalla, depsFrecuente, depsNocturno } from "@/lib/produccion/deps-reales"
import { alFallarDeTarea } from "@/lib/produccion/fallas"
import { armarCarruselTask } from "./armar-carrusel"
import { grabarPiezaTask } from "./grabar-pieza"
import { producirPiezaTask } from "./producir-pieza"

// No retries on either: each job tells Coni or WAV by itself (a retry would repeat the notice), and the next tick of
// the schedule is the retry.

/** One queue for both runs: topics never form while the nightly run merges them. */
export const COLA_DE_MANTENIMIENTO = queue({ name: "mantenimiento", concurrencyLimit: 1 })

/** Every 10 minutes: runs the app could not start, renders that lost their callback (design A10) and reservations that outlived their run and the topics of the claims left behind. */
export const CONFIGURACION_FRECUENTE = {
  id: "mantenimiento-frecuente",
  cron: "*/10 * * * *",
  queue: COLA_DE_MANTENIMIENTO,
  retry: { maxAttempts: 1 },
} as const

/** 03:00 in Chile whatever the daylight saving time (design Q4): file retention, Instagram's token, the backup, the visitor hashes of /l, the yearly review of the data register and the merges of topics. */
export const CONFIGURACION_NOCTURNA = {
  id: "mantenimiento-nocturno",
  cron: { pattern: "0 3 * * *", timezone: "America/Santiago" },
  queue: COLA_DE_MANTENIMIENTO,
  retry: { maxAttempts: 1 },
  maxDuration: 1800,
} as const

/**
 * Starts `grabar-pieza` again for the attempt the piece is on. Global, so the key is the same whichever run (or the
 * app) asks: one recording per piece and attempt.
 */
export async function arrancarGrabacion(piezaId: string, clave: string, intento: number): Promise<void> {
  const idempotencyKey = await idempotencyKeys.create(clave, { scope: "global" })
  await grabarPiezaTask.trigger({ piezaId, intento }, { idempotencyKey, idempotencyKeyTTL: "1d" })
}

export const mantenimientoFrecuenteTask = schedules.task({
  ...CONFIGURACION_FRECUENTE,
  onFailure: alFallarDeTarea("mantenimiento-frecuente", depsFalla),
  run: async () =>
    mantenimientoFrecuente(
      depsFrecuente(
        arrancarGrabacion,
        async (piezaId, clave) => {
          const idempotencyKey = await idempotencyKeys.create(clave, { scope: "global" })
          await producirPiezaTask.trigger({ piezaId }, { idempotencyKey, idempotencyKeyTTL: "1d" })
        },
        async (piezaId, clave) => {
          const idempotencyKey = await idempotencyKeys.create(clave, { scope: "global" })
          await armarCarruselTask.trigger({ piezaId }, { idempotencyKey, idempotencyKeyTTL: "1d" })
        },
      ),
    ),
})

export const mantenimientoNocturnoTask = schedules.task({
  ...CONFIGURACION_NOCTURNA,
  onFailure: alFallarDeTarea("mantenimiento-nocturno", depsFalla),
  run: async () => mantenimientoNocturno(depsNocturno()),
})
