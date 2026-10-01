import type { SupabaseClient } from "@supabase/supabase-js"
import { actualizarPieza, type FilaDePieza } from "@/lib/datos/repositorio"
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
