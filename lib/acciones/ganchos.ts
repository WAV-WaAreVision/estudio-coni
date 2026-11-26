import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import { Falla } from "@/lib/dominio/falla"
import type { Database } from "@/lib/supabase/database.types"
import { exigirConi } from "./biblioteca"
import { aResultado, type Resultado } from "./resultado"

type Db = SupabaseClient<Database>

export const CambioDeFavorito = z.object({ afirmacionId: z.uuid(), favorito: z.boolean() })
export const GANCHO_INEXISTENTE = "Ese gancho ya no está en la Biblioteca."

const SIN_AFIRMACION = "23503"

/**
 * The star of a hook (spec 6b), kept by claim so it holds for new and old hooks alike. Marking what is already marked,
 * or unmarking what is not, changes nothing and is not an error: two taps in two tabs agree.
 */
export function marcarFavorito(deps: { db: Db }, cambio: z.output<typeof CambioDeFavorito>): Promise<Resultado> {
  return aResultado("marcarFavorito", async () => {
    await exigirConi(deps.db)
    const { error } = cambio.favorito
      ? await deps.db
          .from("ganchos_favoritos")
          .upsert({ afirmacion_id: cambio.afirmacionId }, { onConflict: "afirmacion_id", ignoreDuplicates: true })
      : await deps.db.from("ganchos_favoritos").delete().eq("afirmacion_id", cambio.afirmacionId)
    if (error?.code === SIN_AFIRMACION) throw new Falla(GANCHO_INEXISTENTE)
    if (error) throw new Error(`No pude cambiar el favorito ${cambio.afirmacionId}: ${error.message}`, { cause: error })
    return {}
  })
}
