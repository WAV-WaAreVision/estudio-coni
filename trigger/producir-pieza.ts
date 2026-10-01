import { AbortTaskRunError, schemaTask } from "@trigger.dev/sdk"
import { z } from "zod"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import { depsReales } from "@/lib/produccion/deps-reales"
import { producirPieza } from "@/lib/produccion/producir"

export const producirPiezaTask = schemaTask({
  id: "producir-pieza",
  schema: z.object({ piezaId: z.string().uuid() }),
  // A configuration problem will not fix itself between attempts: fail now so WAV sees it, do not retry it.
  catchError: ({ error }) => {
    if (error instanceof FallaDeConfiguracion) throw new AbortTaskRunError(error.message)
  },
  run: async ({ piezaId }) => producirPieza(await depsReales(), piezaId),
})
