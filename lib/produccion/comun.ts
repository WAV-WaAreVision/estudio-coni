import type { SupabaseClient } from "@supabase/supabase-js"
import { actualizarPieza, type FilaDePieza } from "@/lib/datos/repositorio"
import type { Notificador } from "@/lib/proveedores/avisos"
import type { Database } from "@/lib/supabase/database.types"

export const TEXTO_TOPE = "Llegaste al tope de gasto de este mes. Súbelo en Ajustes para seguir."

/** `gastos.estimado_usd` must be positive, so a (hypothetical) empty estimate still reserves the minimum. */
export const MINIMO_USD = 0.0001

/** The precision of `gastos.estimado_usd` and `real_usd`. */
export function aCuatroDecimales(usd: number): number {
  return Math.round(usd * 10_000) / 10_000
}

/** A plain Error: Trigger.dev retries the run, which reads the piece again and finds what changed. */
export function piezaCambio(): Error {
  return new Error("La pieza cambió mientras se producía.")
}

/** Writes only the explanation: the piece stays where it is and Coni reads why nothing happened. */
export async function explicar(
  deps: { db: SupabaseClient<Database> },
  fila: FilaDePieza,
  explicacion: string,
): Promise<void> {
  const guardada = await actualizarPieza(deps.db, fila.id, fila.version, { version: fila.version + 1, explicacion })
  if (!guardada) throw piezaCambio()
}

/**
 * The spend cap stopped a step: Coni reads why on the piece (`explicar`) and is told at once, because the buttons that
 * spend are off until she raises it (design A9). One notice per piece and attempt, so a retried run says it once.
 */
export async function avisarTope(deps: { avisos: Notificador }, fila: FilaDePieza): Promise<void> {
  await deps.avisos.aConi(TEXTO_TOPE, true, {
    tipo: "tope_alcanzado",
    clave: `tope_alcanzado:${fila.id}:${fila.intento}`,
    piezaId: fila.id,
  })
}
