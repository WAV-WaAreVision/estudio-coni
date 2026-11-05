import type { SupabaseClient } from "@supabase/supabase-js"
import { leerFaltasDeAngulo } from "@/lib/datos/angulos"
import { claveDeFalta, mensajeDeFalta } from "@/lib/dominio/angulos"
import { lunesDeLaSemana } from "@/lib/dominio/metricas"
import type { Database } from "@/lib/supabase/database.types"
import { registrarAviso } from "./registro"

/**
 * One notice per angle that falls short and week (spec 15d, section 4). It waits for the summary like the yearly
 * review: a later run of the same week finds its key and writes nothing. Answers how many fall short.
 */
export async function avisarEquilibrioDeAngulos(
  db: SupabaseClient<Database>,
  ahora: string,
  zona: string,
): Promise<number> {
  const instante = Date.parse(ahora)
  const faltas = await leerFaltasDeAngulo(db, instante)
  const lunes = lunesDeLaSemana(instante, zona)
  for (const falta of faltas) {
    await registrarAviso(
      db,
      { tipo: "equilibrio_de_angulo", clave: claveDeFalta(falta.anguloId, lunes) },
      mensajeDeFalta(falta),
    )
  }
  return faltas.length
}
