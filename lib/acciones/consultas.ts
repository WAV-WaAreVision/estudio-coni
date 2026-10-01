import type { SupabaseClient } from "@supabase/supabase-js"
import { borrarConsulta, crearConsulta, leerConsultas } from "@/lib/datos/consultas"
import { leerZona } from "@/lib/datos/metricas"
import { Falla } from "@/lib/dominio/falla"
import { contarEnMes, limitesDelMes } from "@/lib/dominio/metricas"
import type { Database } from "@/lib/supabase/database.types"
import { aResultado, type Resultado } from "./resultado"

export interface DepsConsultas {
  /** Coni's session client: row level security decides who may note one. */
  db: SupabaseClient<Database>
  ahora: () => string
}

/** How many consultations were noted in the month Coni is living. */
async function totalDelMes(deps: DepsConsultas): Promise<number> {
  const zona = await leerZona(deps.db)
  const mes = limitesDelMes(Date.parse(deps.ahora()), zona)
  return contarEnMes(await leerConsultas(deps.db, new Date(mes.desde).toISOString()), mes.clave, zona)
}

/** "Llegó una consulta": one tap, one note, only the moment (design Premisa 5). */
export async function anotarConsulta(deps: DepsConsultas): Promise<Resultado<{ id: string; totalDelMes: number }>> {
  return aResultado("anotarConsulta", async () => {
    const id = await crearConsulta(deps.db)
    return { id, totalDelMes: await totalDelMes(deps) }
  })
}

/** Takes back a tap made by mistake; the database only lets her undo the ones from the last day. */
export async function deshacerConsulta(deps: DepsConsultas, id: string): Promise<Resultado<{ totalDelMes: number }>> {
  return aResultado("deshacerConsulta", async () => {
    if (!(await borrarConsulta(deps.db, id))) throw new Falla("Esa consulta ya no está.")
    return { totalDelMes: await totalDelMes(deps) }
  })
}
