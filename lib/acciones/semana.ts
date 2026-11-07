import type { SupabaseClient } from "@supabase/supabase-js"
import { NO_ARRANCO, puedePedirMotor, YA_PROPUSO } from "@/lib/dominio/biblioteca/semana"
import { Falla } from "@/lib/dominio/falla"
import { domingoDeSemana } from "@/lib/motor/semana"
import type { Database } from "@/lib/supabase/database.types"
import { exigirConi } from "./biblioteca"
import type { DisparosDeBiblioteca } from "./disparos"
import { aResultado, type Resultado } from "./resultado"

type Db = SupabaseClient<Database>

export interface DepsSemana {
  /** Coni's client: row level security applies, and `es_coni` is checked again here. */
  db: Db
  /** `motor-manual`, keyed `motor:<semana>` (claveMotor), so a double tap starts one run. */
  disparar: Pick<DisparosDeBiblioteca, "motor">
  ahora: () => Date
}

/**
 * «Proponer ahora» (ported from Ingesta): asks the engine for this week unless the week is ready or a run is still
 * alive. The week is the Sunday that closes it, the same key the engine writes.
 */
export function proponerAhora(deps: DepsSemana): Promise<Resultado> {
  return aResultado("proponerAhora", async () => {
    await exigirConi(deps.db)
    const ahora = deps.ahora()
    const semana = domingoDeSemana(ahora)
    const { data, error } = await deps.db
      .from("motor_corridas")
      .select("estado, creada_en")
      .eq("semana", semana)
      .maybeSingle()
    if (error) {
      throw new Error(`No pude leer la corrida del motor de la semana ${semana}: ${error.message}`, { cause: error })
    }
    if (!puedePedirMotor(data ? { estado: data.estado, creadaEn: data.creada_en } : null, ahora)) {
      throw new Falla(YA_PROPUSO)
    }
    try {
      await deps.disparar.motor(semana)
    } catch (falla) {
      console.error(`No pude iniciar el motor para la semana ${semana}`, falla)
      throw new Falla(NO_ARRANCO)
    }
    return {}
  })
}
