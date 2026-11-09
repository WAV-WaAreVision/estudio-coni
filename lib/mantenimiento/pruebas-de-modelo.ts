import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import { falloDeBase } from "@/lib/ingesta/gasto-material"
import type { Database } from "@/lib/supabase/database.types"

const Limpieza = z.object({ anteriores: z.number(), candidatas: z.number() })

/** Nightly: the vectors saved for a revert go 30 days after the switch; candidates go with their discarded or old dry run. */
export async function limpiarPruebasDeModelo(deps: {
  db: SupabaseClient<Database>
  ahora: () => string
}): Promise<z.infer<typeof Limpieza>> {
  const { data, error } = await deps.db.rpc("limpiar_huellas_de_prueba", { p_ahora: deps.ahora() })
  if (error) throw falloDeBase("No pude limpiar las huellas de las pruebas de modelo", error)
  return Limpieza.parse(data)
}
