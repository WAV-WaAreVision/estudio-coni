import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/database.types"

type Db = SupabaseClient<Database>

/** The runs `estimarCostoDelMotor` looks at: the latest that cost something, newest first (4a). */
const CORRIDAS_CON_COSTO = 4

export async function leerCostosDelMotor(db: Db): Promise<number[]> {
  const { data, error } = await db
    .from("motor_corridas")
    .select("costo_usd")
    .gt("costo_usd", 0)
    .order("semana", { ascending: false })
    .limit(CORRIDAS_CON_COSTO)
  if (error) throw new Error(`No pude leer lo que costó el motor: ${error.message}`, { cause: error })
  return data.map((fila) => Number(fila.costo_usd))
}
