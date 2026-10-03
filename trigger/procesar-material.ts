import { schemaTask } from "@trigger.dev/sdk"
import { z } from "zod"
import { alFallarMaterial } from "@/lib/ingesta/falla-material"
import { procesarMaterial } from "@/lib/ingesta/procesar"
import { depsFalla, depsProcesar } from "@/lib/produccion/deps-reales"
import { decisionDeReintento } from "@/lib/produccion/reintentos"

export const procesarMaterialTask = schemaTask({
  id: "procesar-material",
  schema: z.object({ materialId: z.string().uuid() }),
  // Two materials at a time: each one holds a video or a PDF in memory and calls paid providers.
  queue: { concurrencyLimit: 2 },
  // A video of an hour is transcribed and read frame by frame: longer than the 900 s of the config.
  maxDuration: 1800,
  catchError: ({ error }) => decisionDeReintento(error),
  // Once the retries are over: the material says why, in words Coni can read, and WAV is told.
  onFailure: ({ payload, error, ctx }) =>
    alFallarMaterial(depsFalla(), { materialId: payload.materialId, corrida: ctx.run.id, error }),
  run: async ({ materialId }) => procesarMaterial(await depsProcesar(), materialId),
})
