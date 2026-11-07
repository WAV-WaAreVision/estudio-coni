import type { SupabaseClient } from "@supabase/supabase-js"
import { leerPausasParaCerrar, type PausaParaCerrar } from "@/lib/datos/pausas"
import { type ProveedorConPausa, TEXTO_PAUSA_CERRADA } from "@/lib/dominio/pausas"
import type { Notificador } from "@/lib/proveedores/avisos"
import type { ResultadoDeChequeo } from "@/lib/proveedores/chequeos"
import type { Database } from "@/lib/supabase/database.types"

export interface DepsPausas {
  /** A `service_role` client. */
  db: SupabaseClient<Database>
  avisos: Notificador
  ahora: () => string
  /** Asks the paused provider its minimal question with the key it uses (`chequearProveedor` in production). */
  chequear: (pausa: PausaParaCerrar) => Promise<ResultadoDeChequeo>
}

export interface ResultadoDePausas {
  cerradas: ProveedorConPausa[]
  abiertas: { proveedor: ProveedorConPausa; motivo: string }[]
}

/**
 * Spec 2026-11-07, decision 5. For each open pause: one check; a good answer tells Coni once (keyed `pausa:<id>`) and
 * closes the pause. The notice goes before the closing: a failed notice leaves the pause open and the next tick sends
 * it (the key keeps it to one), while a notice after a closing that failed would be lost. Nothing is redone on its own.
 */
export async function cerrarPausas(deps: DepsPausas): Promise<ResultadoDePausas> {
  const resultado: ResultadoDePausas = { cerradas: [], abiertas: [] }
  for (const pausa of await leerPausasParaCerrar(deps.db)) {
    const chequeo = await deps.chequear(pausa)
    if (!chequeo.ok) {
      resultado.abiertas.push({ proveedor: pausa.proveedor, motivo: chequeo.motivo })
      continue
    }
    // Coni never saw a Voyage pause (amendment A6), so its closing tells her nothing.
    if (pausa.proveedor !== "voyage") {
      await deps.avisos.aConi(TEXTO_PAUSA_CERRADA[pausa.proveedor], true, {
        tipo: "pausa_cerrada",
        clave: `pausa:${pausa.id}`,
      })
    }
    const { error } = await deps.db.rpc("cerrar_pausa_de_proveedor", { p_id: pausa.id })
    if (error) throw new Error(`No pude cerrar la pausa ${pausa.id}: ${error.message}`, { cause: error })
    resultado.cerradas.push(pausa.proveedor)
  }
  return resultado
}
