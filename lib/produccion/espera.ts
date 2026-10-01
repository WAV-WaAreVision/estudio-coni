import { WaitpointTimeoutError } from "@trigger.dev/sdk"

/**
 * What the run does with the end of `wait.forToken`. The callback of HeyGen wakes it, and so does the timeout of the
 * token; neither says whether the video is ready, so both just return and the caller reads the status by id (design
 * A10). Any other reason is not an answer about the video and surfaces.
 */
export function terminarEspera(resultado: { ok: true; output: unknown } | { ok: false; error: Error }): void {
  if (resultado.ok || resultado.error instanceof WaitpointTimeoutError) return
  throw resultado.error
}
