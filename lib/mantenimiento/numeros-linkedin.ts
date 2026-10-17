import type { SupabaseClient } from "@supabase/supabase-js"
import { leerLinkedinParaAnotar } from "@/lib/datos/metricas-linkedin"
import { asuntoDelRecordatorio, sinNumerosEstaSemana } from "@/lib/metricas/linkedin"
import type { Notificador } from "@/lib/proveedores/avisos"
import type { Database } from "@/lib/supabase/database.types"

export interface DepsNumerosLinkedin {
  db: SupabaseClient<Database>
  avisos: Notificador
  ahora: () => string
}

export type ResultadoRecordatorio = "al_dia" | "ya_avisado" | "avisado"

export const DETALLE_DEL_RECORDATORIO =
  "Entra a Métricas con la sesión de Coni, abre «Para WAV» y anota impresiones, reacciones, comentarios y compartidos de cada post (están en las estadísticas de cada publicación de LinkedIn), y los seguidores de la semana."

/**
 * Decision 20: once a week, from Monday, and only with posts pending. Every nightly run of the week checks: the first one
 * with posts pending claims the week in `recordatorios_linkedin`, so a Monday whose email failed is retried on Tuesday
 * and a sent week says nothing more. The API or Metricool (decision 21) will turn it off by filling the rows.
 */
export async function recordarNumerosDeLinkedin(deps: DepsNumerosLinkedin): Promise<ResultadoRecordatorio> {
  const ahora = Date.parse(deps.ahora())
  const { semana, posts } = await leerLinkedinParaAnotar(deps.db, ahora)
  const pendientes = sinNumerosEstaSemana(posts)
  if (pendientes.length === 0) return "al_dia"
  // Claimed before the email, so a second run of the same week says nothing.
  const reclamo = await deps.db
    .from("recordatorios_linkedin")
    .upsert({ semana }, { onConflict: "semana", ignoreDuplicates: true })
    .select("semana")
  if (reclamo.error) throw new Error(`No pude anotar el recordatorio de la semana: ${reclamo.error.message}`)
  if (reclamo.data.length === 0) return "ya_avisado"
  try {
    await deps.avisos.aWav(asuntoDelRecordatorio(pendientes.length), DETALLE_DEL_RECORDATORIO)
  } catch (error) {
    // The email did not go out: give the week back so the next run can remind, then report the failure.
    const devuelta = await deps.db.from("recordatorios_linkedin").delete().eq("semana", semana)
    if (devuelta.error)
      throw new Error(`No pude devolver el recordatorio de la semana: ${devuelta.error.message}`, { cause: error })
    throw error
  }
  return "avisado"
}
