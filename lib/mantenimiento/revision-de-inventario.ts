import type { SupabaseClient } from "@supabase/supabase-js"
import { diaEnPalabras } from "@/lib/datos-personales/fechas"
import { leerFechasDeRevision } from "@/lib/datos-personales/leer"
import { revisionPorAvisar, venceLaRevision } from "@/lib/datos-personales/revision"
import { diaLocal } from "@/lib/dominio/fechas"
import type { Notificador } from "@/lib/proveedores/avisos"
import type { Database } from "@/lib/supabase/database.types"

export interface DepsRevisionDeInventario {
  /** A `service_role` client. */
  db: SupabaseClient<Database>
  avisos: Notificador
  ahora: () => string
}

export type ResultadoRevisionDeInventario = "al_dia" | "avisado"

/**
 * The yearly review of the register (spec): 30 days before it is due, one notice for Coni (it waits for the daily
 * summary) and one message for WAV, who corrects the register first. The due date is written down after both go out,
 * so a due date is told once.
 */
export async function recordarRevisionDeInventario(
  deps: DepsRevisionDeInventario,
): Promise<ResultadoRevisionDeInventario> {
  const fechas = await leerFechasDeRevision(deps.db)
  const vence = venceLaRevision(fechas)
  const hoy = diaLocal(Date.parse(deps.ahora()), fechas.zona)
  if (!revisionPorAvisar({ vence, avisada: fechas.avisada, hoy })) return "al_dia"

  await deps.avisos.aConi(
    `Te toca revisar tu registro de datos personales antes del ${diaEnPalabras(vence)}. Está en Ajustes, Datos personales: léelo y toca «Lo revisé».`,
    false,
    { tipo: "revision_de_inventario", clave: `revision_de_inventario:${vence}` },
  )
  await deps.avisos.aWav(
    "Revisión anual del registro de datos personales",
    `Coni tiene que revisar su registro antes del ${vence}. Si cambió un proveedor, un país o un plazo, corrígelo antes en Ingesta, Datos personales.`,
  )
  const { error } = await deps.db.from("ajustes").update({ revision_de_inventario_avisada: vence }).eq("id", true)
  if (error) throw new Error(`No pude anotar el aviso de la revisión del ${vence}: ${error.message}`, { cause: error })
  return "avisado"
}
