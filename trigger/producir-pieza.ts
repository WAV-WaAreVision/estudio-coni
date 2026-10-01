import { schemaTask } from "@trigger.dev/sdk"
import { z } from "zod"
import { depsFalla, depsReales } from "@/lib/produccion/deps-reales"
import { alFallarDeTarea } from "@/lib/produccion/fallas"
import { producirPieza } from "@/lib/produccion/producir"
import { decisionDeReintento } from "@/lib/produccion/reintentos"

export const producirPiezaTask = schemaTask({
  id: "producir-pieza",
  schema: z.object({ piezaId: z.string().uuid() }),
  // One run at a time: two runs of the same round would both pay Claude before the first one saves its draft.
  queue: { concurrencyLimit: 1 },
  catchError: ({ error }) => decisionDeReintento(error),
  // Once the retries are over: the piece is left readable for Coni and the alerts go out (design A9).
  onFailure: alFallarDeTarea("producir-pieza", depsFalla),
  run: async ({ piezaId }) => producirPieza(await depsReales(), piezaId),
})
