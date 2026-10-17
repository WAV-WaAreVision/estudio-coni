import type { SupabaseClient } from "@supabase/supabase-js"
import { espacioLibreParaCambiar, repartir, sinFechaFirmada } from "@/lib/calendario/propuestas"
import { leerDatosDeCalendario } from "@/lib/datos/calendario"
import { Falla } from "@/lib/dominio/falla"
import type { Database } from "@/lib/supabase/database.types"
import { aResultado, type Resultado } from "./resultado"

type Db = SupabaseClient<Database>

export interface DepsFechas {
  /** Coni's session: `proponer_fechas` is hers only. */
  db: Db
  ahora: () => string
}

const AGENDA_VENCIDA = "La agenda cambió mientras la mirabas. Vuelve a intentarlo."
const ESPACIO_TOMADO = "Ese espacio ya no está libre. Elige otro."

async function proponer(db: Db, piezas: string[], fechas: string[]): Promise<void> {
  const { error } = await db.rpc("proponer_fechas", { p_piezas: piezas, p_fechas: fechas })
  // A piece passed gate 2, or a time passed, between the read and the write.
  if (error?.message === "propuesta_invalida") throw new Falla(AGENDA_VENCIDA)
  if (error) throw new Error(`No pude guardar las fechas propuestas: ${error.message}`, { cause: error })
}

/** `Repartir fechas` (decision 25): stores the places the Agenda shows for the unsigned pieces without a live proposal. */
export function repartirFechas(deps: DepsFechas): Promise<Resultado<{ propuestas: number }>> {
  return aResultado("repartirFechas", async () => {
    const ahora = Date.parse(deps.ahora())
    const datos = await leerDatosDeCalendario(deps.db, ahora)
    const nuevos = repartir({ piezas: datos.piezas, horario: datos.horario, ahora }).filter((lugar) => !lugar.guardada)
    if (nuevos.length === 0) return { propuestas: 0 }
    await proponer(
      deps.db,
      nuevos.map((lugar) => lugar.piezaId),
      nuevos.map((lugar) => lugar.instante),
    )
    return { propuestas: nuevos.length }
  })
}

/** `Cambiar` under a proposal: another free slot for that piece (amendment A8). */
export function cambiarPropuesta(deps: DepsFechas, piezaId: string, instante: string): Promise<Resultado> {
  return aResultado("cambiarPropuesta", async () => {
    const ahora = Date.parse(deps.ahora())
    const datos = await leerDatosDeCalendario(deps.db, ahora)
    const pieza = datos.piezas.find((candidata) => candidata.id === piezaId)
    if (!pieza || !sinFechaFirmada(pieza.estado)) throw new Falla(AGENDA_VENCIDA)
    if (!espacioLibreParaCambiar({ piezas: datos.piezas, horario: datos.horario, ahora, piezaId, instante })) {
      throw new Falla(ESPACIO_TOMADO)
    }
    await proponer(deps.db, [piezaId], [new Date(Date.parse(instante)).toISOString()])
    return {}
  })
}
