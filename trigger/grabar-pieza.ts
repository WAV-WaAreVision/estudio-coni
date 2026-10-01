import { schemaTask, wait } from "@trigger.dev/sdk"
import { z } from "zod"
import { depsFalla, depsGrabacion } from "@/lib/produccion/deps-reales"
import { terminarEspera } from "@/lib/produccion/espera"
import { alFallarDeTarea } from "@/lib/produccion/fallas"
import { grabarPieza } from "@/lib/produccion/grabar"
import { decisionDeReintento } from "@/lib/produccion/reintentos"

/** ffmpeg re-encodes a Reel in memory: `medium-1x` or larger (design P1). One run at a time. */
export const CONFIGURACION_GRABAR = {
  id: "grabar-pieza",
  machine: "medium-1x",
  queue: { concurrencyLimit: 1 },
} as const

// The most HeyGen is given to answer before the run reads the status by itself (design A10).
const ESPERA_DEL_RENDER = "60m"

export const grabarPiezaTask = schemaTask({
  ...CONFIGURACION_GRABAR,
  schema: z.object({ piezaId: z.string().uuid() }),
  catchError: ({ error }) => decisionDeReintento(error),
  // Once the retries are over: the piece is left readable for Coni and the alerts go out (design A9).
  onFailure: alFallarDeTarea("grabar-pieza", depsFalla),
  run: async ({ piezaId }, { ctx }) => {
    // One token per run, not per attempt: a retry of this run gets the same token back (same key), so it does not
    // wait a second hour for a callback that HeyGen already sent, or will send, to the first one.
    const token = await wait.createToken({ timeout: ESPERA_DEL_RENDER, idempotencyKey: `render-${ctx.run.id}` })
    const deps = await depsGrabacion({
      callbackUrl: token.url,
      esperarRender: async () => terminarEspera(await wait.forToken(token)),
    })
    return grabarPieza(deps, piezaId)
  },
})
