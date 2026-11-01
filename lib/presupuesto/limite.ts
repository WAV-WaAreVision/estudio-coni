import type { SupabaseClient } from "@supabase/supabase-js"
import { existeAviso } from "@/lib/avisos/registro"
import { limiteDelMes } from "@/lib/datos/repositorio"
import { diaLocal } from "@/lib/dominio/fechas"
import { dolares } from "@/lib/formato"
import type { Notificador } from "@/lib/proveedores/avisos"
import type { Database } from "@/lib/supabase/database.types"

/** The month `reservar_gasto` counts in (supabase/migrations/20261103000100_presupuesto.sql). */
export const ZONA_DEL_GASTO = "America/Santiago"

/** What every path stopped by the hard limit says (spec 2026-11-02). */
export const TEXTO_LIMITE = "Llegaste a tu límite de este mes. Reactívalo en Ajustes."

/** «2026-11»: the Santiago month of an instant, the one the database counts the spend in. */
export function mesDelGasto(ahora: string): string {
  return diaLocal(Date.parse(ahora), ZONA_DEL_GASTO).slice(0, 7)
}

/** Notices dedupe by key: one key per month means one notice per month. */
export function claveDelAvisoDeLimite(mes: string): string {
  return `limite_alcanzado:${mes}`
}

export function textoDelAvisoDeLimite(limiteUsd: number): string {
  return `Llegaste a tu límite de ${dolares(limiteUsd)} de este mes. Lo nuevo quedó en pausa; lo que ya firmaste sigue.`
}

export interface DepsDelAvisoDeLimite {
  /** A `service_role` client. */
  db: SupabaseClient<Database>
  avisos: Notificador
}

/**
 * The hard limit stopped something new (D3): Coni gets one urgent notice a month, which opens Ajustes › Presupuesto,
 * and WAV one email, only the first time. A failed notice propagates: it never lets the spend through, and the run's
 * result shows it.
 */
export async function avisarLimite(deps: DepsDelAvisoDeLimite, ahora: string): Promise<void> {
  const mes = mesDelGasto(ahora)
  const clave = claveDelAvisoDeLimite(mes)
  const yaAvisado = await existeAviso(deps.db, clave)
  const limite = await limiteDelMes(deps.db, ahora)
  await deps.avisos.aConi(textoDelAvisoDeLimite(limite), true, { tipo: "limite_alcanzado", clave })
  if (yaAvisado) return
  await deps.avisos.aWav(
    `Coni llegó a su límite de gasto (${mes})`,
    `El gasto nuevo quedó en pausa al llegar a ${dolares(limite)} en ${mes}. Lo firmado sigue. Coni lo reactiva en Ajustes, Presupuesto.`,
  )
}
