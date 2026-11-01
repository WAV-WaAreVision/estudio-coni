import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/database.types"

export interface VersionDeTransparencia {
  version: number
  texto: string
  motivo: string
  creadaEn: string
  propuesta: boolean
  vigente: boolean
}

export interface VersionesDeTransparencia {
  /** What /l/ia shows, or null before the first publication. */
  vigente: VersionDeTransparencia | null
  /** WAV's draft (version 0). */
  propuesta: VersionDeTransparencia | null
  /** Coni's publications, newest first. */
  historial: VersionDeTransparencia[]
}

/**
 * Ajustes › Página de IA, with Coni's session. RLS lets only Coni and WAV read the versions, so any other user gets
 * empty results rather than an error: the page checks the role before calling this.
 */
export async function leerVersionesDeTransparencia(db: SupabaseClient<Database>): Promise<VersionesDeTransparencia> {
  const { data, error } = await db
    .from("transparencia_versiones")
    .select("version, texto, motivo, creada_en, propuesta, vigente")
    .order("version", { ascending: false })
  if (error) throw new Error(`No pude leer las versiones de la página de IA: ${error.message}`, { cause: error })
  const versiones = data.map((fila) => ({
    version: fila.version,
    texto: fila.texto,
    motivo: fila.motivo,
    creadaEn: fila.creada_en,
    propuesta: fila.propuesta,
    vigente: fila.vigente,
  }))
  return {
    vigente: versiones.find((version) => version.vigente) ?? null,
    propuesta: versiones.find((version) => version.propuesta) ?? null,
    historial: versiones.filter((version) => !version.propuesta),
  }
}
