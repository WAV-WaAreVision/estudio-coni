import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import { type Calibracion, MODELOS_DE_HUELLAS } from "@/lib/dominio/parecido"
import { falloDeBase } from "@/lib/ingesta/gasto-material"
import type { Database } from "@/lib/supabase/database.types"

type Db = SupabaseClient<Database>

const Fila = z.object({
  version: z.number().int(),
  modelo: z.enum(MODELOS_DE_HUELLAS),
  tema: z.coerce.number(),
  grupo: z.coerce.number(),
  fusion: z.coerce.number(),
  puente_min: z.coerce.number(),
  puente_max: z.coerce.number(),
})

/**
 * The vigente calibration (or a given version): the model every embed uses and the thresholds every similarity test
 * reads. Callers read it once per run and pass it down.
 */
export async function leerCalibracion(db: Db, version?: number): Promise<Calibracion> {
  const consulta = db
    .from("calibraciones_de_parecido")
    .select("version, modelo, tema, grupo, fusion, puente_min, puente_max")
  const { data, error } = await (version === undefined
    ? consulta.eq("vigente", true)
    : consulta.eq("version", version)
  ).single()
  if (error) throw falloDeBase("No pude leer la calibración de parecido", error)
  const f = Fila.parse(data)
  return {
    version: f.version,
    modelo: f.modelo,
    tema: f.tema,
    grupo: f.grupo,
    fusion: f.fusion,
    puenteMin: f.puente_min,
    puenteMax: f.puente_max,
  }
}
