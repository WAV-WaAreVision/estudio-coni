import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import { RechazoDeClaude, RespuestaCortada } from "@/lib/proveedores/anthropic"

/**
 * What the task's `catchError` hook answers to Trigger.dev. A configuration problem, a refusal from Claude and an answer
 * cut at `max_tokens` will not fix themselves between attempts (and each attempt costs money), so they fail the run at
 * once; every other error keeps the retry policy of the config.
 * The hook must return this: a throw inside `catchError` is reported as an internal error and may still be retried.
 */
export function decisionDeReintento(error: unknown): { skipRetrying: true } | undefined {
  const definitivo =
    error instanceof FallaDeConfiguracion || error instanceof RechazoDeClaude || error instanceof RespuestaCortada
  return definitivo ? { skipRetrying: true } : undefined
}
