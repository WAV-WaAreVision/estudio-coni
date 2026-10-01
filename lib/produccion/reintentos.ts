import { FallaDeConfiguracion } from "@/lib/dominio/falla"

/**
 * What the task's `catchError` hook answers to Trigger.dev. A configuration problem will not fix itself between
 * attempts, so it fails the run at once and WAV sees it; every other error keeps the retry policy of the config.
 * The hook must return this: a throw inside `catchError` is reported as an internal error and may still be retried.
 */
export function decisionDeReintento(error: unknown): { skipRetrying: true } | undefined {
  return error instanceof FallaDeConfiguracion ? { skipRetrying: true } : undefined
}
