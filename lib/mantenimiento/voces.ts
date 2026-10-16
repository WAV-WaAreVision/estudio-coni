import type { SupabaseClient } from "@supabase/supabase-js"
import { cambiosDesdePieza, piezaDesdeFila } from "@/lib/datos/piezas"
import { actualizarPieza, leerVocesTrabadas } from "@/lib/datos/repositorio"
import { transicionar } from "@/lib/dominio/estados"
import { TEXTO_SIN_VOZ } from "@/lib/produccion/voz"
import type { Database } from "@/lib/supabase/database.types"

/** A voice takes seconds; a quarter of an hour without a write means the run is gone. */
const MINUTOS_PARA_DEVOLVER = 15

/**
 * The net under `grabar-voz`: a piece left in `grabando_voz` goes back to gate 1 with a reason, so Coni can ask for her
 * voice again. A run that was only slow finds the piece moved and ends without writing; its take stays in the store
 * and the next "Preparar mi voz" reuses it.
 */
export async function devolverVocesTrabadas(deps: {
  db: SupabaseClient<Database>
  ahora: () => string
}): Promise<string[]> {
  const corte = new Date(Date.parse(deps.ahora()) - MINUTOS_PARA_DEVOLVER * 60_000).toISOString()
  const devueltas: string[] = []
  for (const fila of await leerVocesTrabadas(deps.db, corte)) {
    // Handed back like any voice that could not be made: Coni asks for it again with "Preparar mi voz".
    const { pieza } = transicionar(piezaDesdeFila(fila), { tipo: "falla_voz", explicacion: TEXTO_SIN_VOZ })
    // Null: the run wrote meanwhile, so it is not stuck.
    if (await actualizarPieza(deps.db, fila.id, fila.version, cambiosDesdePieza(pieza))) devueltas.push(fila.id)
  }
  return devueltas
}
