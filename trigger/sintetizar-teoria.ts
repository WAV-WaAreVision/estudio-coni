import { schemaTask } from "@trigger.dev/sdk"
import { z } from "zod"
import { alFallarTeoria, armarTeoria } from "@/lib/ingesta/teoria"
import { depsFalla, depsTeoria } from "@/lib/produccion/deps-reales"
import { decisionDeReintento } from "@/lib/produccion/reintentos"

export const sintetizarTeoriaTask = schemaTask({
  id: "sintetizar-teoria",
  schema: z.object({ teoriaId: z.string().uuid() }),
  // One Opus call over up to eight cards: two at a time keeps the spend and the memory small.
  queue: { concurrencyLimit: 2 },
  maxDuration: 300,
  catchError: ({ error }) => decisionDeReintento(error),
  // Once the retries are over: the theory says why, in words Coni can read, and WAV is told.
  onFailure: ({ payload, error, ctx }) =>
    alFallarTeoria(depsFalla(), { teoriaId: payload.teoriaId, corrida: ctx.run.id, error }),
  run: async ({ teoriaId }) => armarTeoria(await depsTeoria(), teoriaId),
})
