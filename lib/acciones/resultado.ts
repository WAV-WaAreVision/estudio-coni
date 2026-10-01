import { Falla } from "@/lib/dominio/falla"

/** What every Server Action answers: Next redacts thrown messages, so errors travel as values. */
export type Resultado<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string }

export const ERROR_GENERICO = "Algo falló de nuestro lado. Inténtalo de nuevo en unos minutos."

/**
 * Runs an action. A `Falla` carries a message written for Coni and is returned as is. Anything else (a
 * configuration failure, an unauthorised approval, a database error) is logged for WAV and shown as a generic notice.
 */
export async function aResultado<T extends object>(nombre: string, trabajo: () => Promise<T>): Promise<Resultado<T>> {
  try {
    return { ok: true, ...(await trabajo()) }
  } catch (error) {
    if (error instanceof Falla) return { ok: false, error: error.message }
    console.error(`La acción ${nombre} falló`, error)
    return { ok: false, error: ERROR_GENERICO }
  }
}
