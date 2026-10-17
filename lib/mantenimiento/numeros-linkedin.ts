import type { SupabaseClient } from "@supabase/supabase-js"
import { leerZona } from "@/lib/datos/metricas"
import { leerLinkedinParaAnotar } from "@/lib/datos/metricas-linkedin"
import { diaLocal } from "@/lib/dominio/fechas"
import { lunesDeLaSemana } from "@/lib/dominio/metricas"
import { asuntoDelRecordatorio } from "@/lib/metricas/linkedin"
import type { Notificador } from "@/lib/proveedores/avisos"
import type { Database } from "@/lib/supabase/database.types"

export interface DepsNumerosLinkedin {
  db: SupabaseClient<Database>
  avisos: Notificador
  ahora: () => string
}

export type ResultadoRecordatorio = "no_es_lunes" | "al_dia" | "avisado"

export const DETALLE_DEL_RECORDATORIO =
  "Entra a Métricas con la sesión de Coni, abre «Para WAV» y anota impresiones, reacciones, comentarios y compartidos de cada post (están en las estadísticas de cada publicación de LinkedIn), y los seguidores de la semana."

/**
 * Decision 20: on Mondays only, and only with posts pending. The nightly run starts once a day with no retries, so this
 * goes out at most once a week; the API or Metricool (decision 21) will turn it off by filling the rows.
 */
export async function recordarNumerosDeLinkedin(deps: DepsNumerosLinkedin): Promise<ResultadoRecordatorio> {
  const ahora = Date.parse(deps.ahora())
  const zona = await leerZona(deps.db)
  if (lunesDeLaSemana(ahora, zona) !== diaLocal(ahora, zona)) return "no_es_lunes"
  const { pendientes } = await leerLinkedinParaAnotar(deps.db, ahora)
  if (pendientes.length === 0) return "al_dia"
  await deps.avisos.aWav(asuntoDelRecordatorio(pendientes.length), DETALLE_DEL_RECORDATORIO)
  return "avisado"
}
