import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import { Falla } from "@/lib/dominio/falla"
import {
  type AvisoDeFusion,
  pilaresCambiadosDe,
  RECHAZOS_DE_FUSION,
  VEREDICTOS_DE_FUSION,
  type VeredictoDeFusion,
} from "@/lib/dominio/fusiones"
import type { Database } from "@/lib/supabase/database.types"
import { exigirConi } from "./biblioteca"
import { aResultado, ERROR_SOLO_CONI, type Resultado } from "./resultado"

type Db = SupabaseClient<Database>

export interface DepsFusiones {
  db: Db
}

export const DecisionDeFusion = z.object({ id: z.uuid(), veredicto: z.enum(VEREDICTOS_DE_FUSION) })
export const SobreFusion = z.object({ id: z.uuid() })
export const ParDeTemas = z.object({ a: z.uuid(), b: z.uuid() })

const AVISO_POR_VEREDICTO: Record<VeredictoDeFusion, AvisoDeFusion> = {
  mismo: "fusion-unida",
  parte_de: "fusion-subtema",
  distintos: "fusion-separada",
}

/** A database refusal in her words, or the error as it came for WAV's log. */
function rechazo(que: string, error: { message: string }): Error {
  if (error.message === "sin_permiso") return new Falla(ERROR_SOLO_CONI)
  const texto = RECHAZOS_DE_FUSION[error.message]
  return texto ? new Falla(texto) : new Error(`${que}: ${error.message}`, { cause: error })
}

/** `pilares_cambiados` names the winner, so it needs a read the static map cannot do. */
async function rechazoDeDeshacer(db: Db, id: string, error: { message: string }): Promise<Error> {
  if (error.message !== "pilares_cambiados") return rechazo(`No pude deshacer la fusión ${id}`, error)
  const { data, error: errorDeLectura } = await db
    .from("fusiones")
    .select("ganador:temas!fusiones_ganador_id_fkey ( nombre )")
    .eq("id", id)
    .maybeSingle()
  if (errorDeLectura) {
    return new Error(`No pude leer el ganador de la fusión ${id}: ${errorDeLectura.message}`, { cause: errorDeLectura })
  }
  const nombre = data?.ganador?.nombre
  return nombre
    ? new Falla(pilaresCambiadosDe(nombre))
    : new Error(`No pude deshacer la fusión ${id}: ${error.message}`, { cause: error })
}

export function decidirFusion(
  deps: DepsFusiones,
  decision: z.output<typeof DecisionDeFusion>,
): Promise<Resultado<{ aviso: AvisoDeFusion }>> {
  return aResultado("decidirFusion", async () => {
    await exigirConi(deps.db)
    const { error } = await deps.db.rpc("decidir_fusion", { p_fusion: decision.id, p_veredicto: decision.veredicto })
    if (error) throw rechazo(`No pude decidir la fusión ${decision.id}`, error)
    return { aviso: AVISO_POR_VEREDICTO[decision.veredicto] }
  })
}

export function deshacerFusion(
  deps: DepsFusiones,
  sobre: z.output<typeof SobreFusion>,
): Promise<Resultado<{ aviso: AvisoDeFusion }>> {
  return aResultado("deshacerFusion", async () => {
    await exigirConi(deps.db)
    const { error } = await deps.db.rpc("deshacer_fusion", { p_fusion: sobre.id })
    if (error) throw await rechazoDeDeshacer(deps.db, sobre.id, error)
    const aviso: AvisoDeFusion = "fusion-deshecha"
    return { aviso }
  })
}

export function unirTemasAMano(
  deps: DepsFusiones,
  par: z.output<typeof ParDeTemas>,
): Promise<Resultado<{ aviso: AvisoDeFusion }>> {
  return aResultado("unirTemasAMano", async () => {
    await exigirConi(deps.db)
    const { error } = await deps.db.rpc("unir_temas_a_mano", { p_a: par.a, p_b: par.b })
    if (error) throw rechazo(`No pude unir los temas ${par.a} y ${par.b}`, error)
    const aviso: AvisoDeFusion = "fusion-unida"
    return { aviso }
  })
}
