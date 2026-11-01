import type { SupabaseClient } from "@supabase/supabase-js"
import { conLaPropuestaPrimero, ocupadasEnLaPuerta, propuestaVigente } from "@/lib/calendario/propuestas"
import { leerContextoDeFechas } from "@/lib/datos/pantallas"
import { etiquetaDeFecha, proponerFechas } from "@/lib/dominio/fechas"
import type { Database } from "@/lib/supabase/database.types"
import type { FechaPropuesta } from "./video/[id]/pantalla-video"

const UNA_HORA_MS = 60 * 60 * 1000
const FECHAS_A_OFRECER = 4

/**
 * The times gate 2 offers, reel or carousel: free slots of her schedule at least an hour ahead, with the piece's live
 * proposal (`fechas_propuestas`, from Repartir) first. Also the zone and the schedule hour: the labels of a scheduled
 * piece and the start of "Otra fecha y hora".
 */
export async function fechasDePuerta2(
  db: SupabaseClient<Database>,
  piezaId: string,
  ahora: number,
): Promise<{ fechas: FechaPropuesta[]; zona: string; horaDelRitmo: string }> {
  const contexto = await leerContextoDeFechas(db, piezaId)
  const ocupadas = ocupadasEnLaPuerta(contexto, ahora)
  const tomadas = new Set(ocupadas.map((iso) => Date.parse(iso)))
  const propuesta = propuestaVigente(contexto.propuesta, { ahora, tomadas, antelacionMs: UNA_HORA_MS })
  const fechas = conLaPropuestaPrimero(
    proponerFechas({
      ahora,
      horario: contexto.horario,
      ocupadas,
      cuantas: FECHAS_A_OFRECER,
      antelacionMs: UNA_HORA_MS,
    }),
    propuesta,
    FECHAS_A_OFRECER,
  ).map((iso) => ({
    iso,
    etiqueta: etiquetaDeFecha(iso, contexto.horario.zona, "larga"),
    corta: etiquetaDeFecha(iso, contexto.horario.zona, "corta"),
  }))
  return { fechas, zona: contexto.horario.zona, horaDelRitmo: contexto.horario.hora }
}
