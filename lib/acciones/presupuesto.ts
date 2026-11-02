import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import { Falla } from "@/lib/dominio/falla"
import { dolares } from "@/lib/formato"
import { MAXIMO_DEL_LIMITE_USD } from "@/lib/presupuesto/presentar"
import type { Database } from "@/lib/supabase/database.types"
import { aResultado, type Resultado } from "./resultado"

const TEXTO_LIMITE_ALTO = "El límite no puede pasar de US$ 1.000."

// The database rounds too; rounding here first makes US$ 1.000,004 a valid US$ 1.000.
const EntradaDeLimite = z.object({
  limite: z
    .number()
    .positive()
    .transform((limite) => Math.round(limite * 100) / 100),
})

/**
 * «Reactivar» in Ajustes › Presupuesto (D4): Coni sets this month's limit through `fijar_limite_del_mes`, which is hers
 * alone and refuses a limit that does not cover what the month already used. Nothing stopped restarts by itself (D7).
 */
export function reactivarLimite(
  db: SupabaseClient<Database>,
  entrada: unknown,
): Promise<Resultado<{ limite: number }>> {
  return aResultado("reactivarLimite", async () => {
    const datos = EntradaDeLimite.safeParse(entrada)
    if (!datos.success) throw new Falla("Escribe tu límite en dólares, por ejemplo 120.")
    if (datos.data.limite > MAXIMO_DEL_LIMITE_USD) throw new Falla(TEXTO_LIMITE_ALTO)
    const { data, error } = await db.rpc("fijar_limite_del_mes", { p_limite: datos.data.limite })
    if (error) {
      if (error.message === "limite_bajo") {
        const usado = /usado=([0-9.]+)/.exec(error.details ?? "")?.[1]
        throw new Falla(
          usado === undefined
            ? "Ese límite no alcanza para lo que ya gastaste este mes. Elige uno mayor."
            : `Ese límite no alcanza: ya gastaste ${dolares(Number(usado))} este mes. Elige uno mayor.`,
        )
      }
      if (error.message === "limite_bajo_el_tope") {
        const tope = /tope=([0-9.]+)/.exec(error.details ?? "")?.[1]
        throw new Falla(
          tope === undefined
            ? "Tu límite no puede ser menor que tu tope."
            : `Tu límite no puede ser menor que tu tope de ${dolares(Number(tope))}.`,
        )
      }
      if (error.message === "limite_alto") throw new Falla(TEXTO_LIMITE_ALTO)
      throw new Error(`No pude reactivar el límite: ${error.message}`, { cause: error })
    }
    return { limite: Number(data.limite_usd) }
  })
}
