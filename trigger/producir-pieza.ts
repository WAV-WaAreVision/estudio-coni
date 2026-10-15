import { schemaTask } from "@trigger.dev/sdk"
import { z } from "zod"
import { depsFalla, depsReales } from "@/lib/produccion/deps-reales"
import { alFallarDeTarea } from "@/lib/produccion/fallas"
import { producirPieza } from "@/lib/produccion/producir"
import { decisionDeReintento } from "@/lib/produccion/reintentos"

/**
 * Claude writes and reviews (three calls of up to two attempts of 120 s) and ElevenLabs speaks the draft (up to 300 s):
 * 1020 s in the worst case, past the 900 s default of trigger.config.ts (design 2026-10-15, open question 2).
 */
export const CONFIGURACION_PRODUCIR = {
  id: "producir-pieza",
  maxDuration: 1200,
  // One run at a time: two runs of the same round would both pay Claude before the first one saves its draft.
  queue: { concurrencyLimit: 1 },
} as const

export const producirPiezaTask = schemaTask({
  ...CONFIGURACION_PRODUCIR,
  schema: z.object({ piezaId: z.string().uuid() }),
  catchError: ({ error }) => decisionDeReintento(error),
  // Once the retries are over: the piece is left readable for Coni and the alerts go out (design A9).
  onFailure: alFallarDeTarea("producir-pieza", depsFalla),
  run: async ({ piezaId }) => producirPieza(await depsReales(), piezaId),
})
