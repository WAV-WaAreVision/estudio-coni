import type { SupabaseClient } from "@supabase/supabase-js"
import type { Notificador } from "@/lib/proveedores/avisos"
import type { Database } from "@/lib/supabase/database.types"
import { marcarEnviados, registrarAviso } from "./registro"

export interface OpcionesConRegistro {
  /** A `service_role` client. */
  db: SupabaseClient<Database>
  /** What carries a notice: push with email as the fallback. */
  canal: Notificador
  ahora: () => string
}

/**
 * The notifier the tasks use (design A9). Every notice to Coni is written to `avisos` first, once per key. An urgent
 * one goes out at once and the row notes when and by which channel; the rest stay unsent for the 08:30 summary and the
 * answer is `null`. If the sending fails the row stays unsent and the failure propagates, so a retry sends it.
 */
export function notificadorConRegistro(opciones: OpcionesConRegistro): Notificador {
  const { db, canal, ahora } = opciones
  return {
    async aConi(mensaje, urgente, aviso) {
      const fila = await registrarAviso(db, aviso, mensaje)
      if (fila.enviado_en !== null) return fila.canal
      if (!urgente) return null
      const enviado = await canal.aConi(mensaje, true, aviso)
      if (enviado !== null) await marcarEnviados(db, [fila.id], enviado, ahora())
      return enviado
    },
    resumenAConi: (resumen) => canal.resumenAConi(resumen),
    aWav: (asunto, detalle) => canal.aWav(asunto, detalle),
  }
}
