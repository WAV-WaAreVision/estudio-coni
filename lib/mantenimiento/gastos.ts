import type { SupabaseClient } from "@supabase/supabase-js"
import { confirmarGasto, type FilaDePieza, leerGastosAbiertos, liberarGasto } from "@/lib/datos/repositorio"
import type { Database } from "@/lib/supabase/database.types"

export interface DepsBarrido {
  /** A `service_role` client. */
  db: SupabaseClient<Database>
  ahora: () => string
}

const HORA_MS = 3_600_000
const HORAS_PARA_MIRAR = 1
const HORAS_PARA_LIBERAR = 24

/** Past the HeyGen step: the video was created (and charged) or the piece moved on from the render. */
const DESPUES_DEL_RENDER = ["subtitulando", "video_por_aprobar", "programado", "publicado", "error_publicacion"]
/** Before the script step is over: nothing was saved from it. */
const ANTES_DEL_GUION = ["idea", "guion_en_proceso"]

/** Did the step this reservation paid for already happen? Then the money is spent, whatever the run that died said. */
function pasoRealizado(proveedor: string, pieza: FilaDePieza): boolean {
  if (proveedor === "heygen") return pieza.render_id !== null || DESPUES_DEL_RENDER.includes(pieza.estado)
  return !ANTES_DEL_GUION.includes(pieza.estado)
}

/**
 * Closes the reservations a run left open (design: the cap counts reserved money, so a dead run must not hold it for
 * ever). After an hour, a reservation whose piece is already past its step is confirmed at its estimate, because the
 * provider charged; one whose step never happened is released once it is a day old, in case the run is only slow.
 */
export async function barrerGastos(deps: DepsBarrido): Promise<{ confirmados: number; liberados: number }> {
  const ahora = Date.parse(deps.ahora())
  const abiertos = await leerGastosAbiertos(deps.db, new Date(ahora - HORAS_PARA_MIRAR * HORA_MS).toISOString())
  let confirmados = 0
  let liberados = 0
  for (const { gasto, pieza } of abiertos) {
    if (pieza && pasoRealizado(gasto.proveedor, pieza)) {
      await confirmarGasto(deps.db, gasto.clave, gasto.estimado_usd)
      confirmados += 1
    } else if (ahora - Date.parse(gasto.creado_en) >= HORAS_PARA_LIBERAR * HORA_MS) {
      await liberarGasto(deps.db, gasto.clave)
      liberados += 1
    }
  }
  return { confirmados, liberados }
}
