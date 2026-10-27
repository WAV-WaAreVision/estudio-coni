import { schemaTask } from "@trigger.dev/sdk"
import { z } from "zod"
import { armarCarrusel } from "@/lib/produccion/armar-carrusel"
import { depsArmado, depsFalla } from "@/lib/produccion/deps-reales"
import { alFallarDeTarea } from "@/lib/produccion/fallas"
import { decisionDeReintento } from "@/lib/produccion/reintentos"

/**
 * Chromium renders a carousel in a minute (design 2026-10-26, D4): medium-1x for its memory, one run at a time, two
 * retries before the piece goes to error_produccion (plan amendment 8). A shortening adds one Claude call.
 */
export const CONFIGURACION_ARMAR = {
  id: "armar-carrusel",
  machine: "medium-1x",
  maxDuration: 600,
  queue: { concurrencyLimit: 1 },
  retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 5000, maxTimeoutInMs: 60000, randomize: true },
} as const

export const ENTRADA_DE_ARMAR = z.object({ piezaId: z.string().uuid() })

export const armarCarruselTask = schemaTask({
  ...CONFIGURACION_ARMAR,
  schema: ENTRADA_DE_ARMAR,
  catchError: ({ error }) => decisionDeReintento(error),
  // Once the retries are over: the version is marked fallo and the piece waits in error_produccion for Reintentar.
  onFailure: alFallarDeTarea("armar-carrusel", depsFalla),
  run: async ({ piezaId }) => armarCarrusel(await depsArmado(), piezaId),
})
