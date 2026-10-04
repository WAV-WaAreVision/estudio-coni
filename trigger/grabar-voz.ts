import { schemaTask } from "@trigger.dev/sdk"
import { z } from "zod"
import { depsFalla, depsVoz } from "@/lib/produccion/deps-reales"
import { alFallarDeTarea } from "@/lib/produccion/fallas"
import { grabarVoz } from "@/lib/produccion/grabar-voz"
import { decisionDeReintento } from "@/lib/produccion/reintentos"

/** One ElevenLabs call and an upload: no ffmpeg, no wait token, and never queued behind an hour-long render. */
export const CONFIGURACION_VOZ = {
  id: "grabar-voz",
  machine: "small-1x",
  maxDuration: 600,
  queue: { concurrencyLimit: 2 },
} as const

export const grabarVozTask = schemaTask({
  ...CONFIGURACION_VOZ,
  schema: z.object({ piezaId: z.string().uuid(), nueva: z.boolean() }),
  catchError: ({ error }) => decisionDeReintento(error),
  // Once the retries are over: the piece goes back to Coni with a reason, and WAV is told.
  onFailure: alFallarDeTarea("grabar-voz", depsFalla),
  run: async ({ piezaId, nueva }) => grabarVoz(depsVoz(), { piezaId, nueva }),
})
