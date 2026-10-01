import { schemaTask } from "@trigger.dev/sdk"
import { z } from "zod"
import { depsReales } from "@/lib/produccion/deps-reales"
import { producirPieza } from "@/lib/produccion/producir"
import { decisionDeReintento } from "@/lib/produccion/reintentos"

export const producirPiezaTask = schemaTask({
  id: "producir-pieza",
  schema: z.object({ piezaId: z.string().uuid() }),
  // One run at a time: two runs of the same round would both pay Claude before the first one saves its draft.
  queue: { concurrencyLimit: 1 },
  catchError: ({ error }) => decisionDeReintento(error),
  run: async ({ piezaId }) => producirPieza(await depsReales(), piezaId),
})
