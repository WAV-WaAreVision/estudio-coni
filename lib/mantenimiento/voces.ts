import type { SupabaseClient } from "@supabase/supabase-js"
import { cambiosDesdePieza, piezaDesdeFila } from "@/lib/datos/piezas"
import { actualizarPieza, leerVocesTrabadas } from "@/lib/datos/repositorio"
import { transicionar } from "@/lib/dominio/estados"
import type { Database } from "@/lib/supabase/database.types"

export const EXPLICACION_VOZ_TRABADA = "La voz no terminó de grabarse. Vuelve a intentarlo."
/** A voice takes seconds; a quarter of an hour without a write means the run is gone. */
const MINUTOS_PARA_DEVOLVER = 15

/**
 * The net under `grabar-voz`: a piece left in `grabando_voz` goes back to Coni with a reason, so the buttons work
 * again. A run that was only slow finds the piece moved and ends without writing; its take stays in the store and the
 * next "Grabar voz" reuses it.
 */
export async function devolverVocesTrabadas(deps: {
  db: SupabaseClient<Database>
  ahora: () => string
}): Promise<string[]> {
  const corte = new Date(Date.parse(deps.ahora()) - MINUTOS_PARA_DEVOLVER * 60_000).toISOString()
  const devueltas: string[] = []
  for (const fila of await leerVocesTrabadas(deps.db, corte)) {
    const { pieza } = transicionar(piezaDesdeFila(fila), { tipo: "falla_voz", explicacion: EXPLICACION_VOZ_TRABADA })
    // Null: the run wrote meanwhile, so it is not stuck.
    if (await actualizarPieza(deps.db, fila.id, fila.version, cambiosDesdePieza(pieza))) devueltas.push(fila.id)
  }
  return devueltas
}
