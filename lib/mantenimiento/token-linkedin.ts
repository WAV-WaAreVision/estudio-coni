import type { SupabaseClient } from "@supabase/supabase-js"
import { leerVencimientoLinkedin } from "@/lib/datos/repositorio"
import { avisoDeVencimientoLinkedin, versionDeLinkedinPorVencer } from "@/lib/dominio/linkedin"
import type { Notificador } from "@/lib/proveedores/avisos"
import { VERSION_DE_LINKEDIN } from "@/lib/proveedores/linkedin"
import type { Database } from "@/lib/supabase/database.types"

export interface DepsTokenLinkedin {
  db: SupabaseClient<Database>
  avisos: Notificador
  ahora: () => string
}

export type ResultadoTokenLinkedin = "sin_conexion" | "vigente" | "avisado"

/**
 * LinkedIn gives a self-serve app no refresh token (F12): Coni renews by connecting again. She is told at 14 days,
 * at 3 days and when it expired, once per threshold and token (the key carries the expiry date).
 */
export async function mantenerTokenLinkedin(deps: DepsTokenLinkedin): Promise<ResultadoTokenLinkedin> {
  if (versionDeLinkedinPorVencer(VERSION_DE_LINKEDIN, deps.ahora())) {
    await deps.avisos.aWav(
      "Hay que subir la versión de la API de LinkedIn",
      `VERSION_DE_LINKEDIN es ${VERSION_DE_LINKEDIN}. Cada versión dura al menos un año: súbela en lib/proveedores/linkedin.ts.`,
    )
  }
  const expiraEn = await leerVencimientoLinkedin(deps.db)
  if (!expiraEn) return "sin_conexion"
  const aviso = avisoDeVencimientoLinkedin(Date.parse(expiraEn), Date.parse(deps.ahora()))
  if (!aviso) return "vigente"
  const mensaje =
    aviso.umbral === 0
      ? "Tu conexión con LinkedIn venció. Mientras no la renueves en Ajustes, tus videos de LinkedIn te quedarán para subir a mano."
      : `Tu conexión con LinkedIn vence en ${aviso.dias === 1 ? "1 día" : `${aviso.dias} días`}. Entra a Ajustes y toca Renovar LinkedIn: toma un minuto. Si no, tus videos te quedarán para subir a mano.`
  await deps.avisos.aConi(mensaje, true, {
    tipo: "linkedin_por_vencer",
    clave: `linkedin_por_vencer:${aviso.umbral}:${expiraEn.slice(0, 10)}`,
  })
  return "avisado"
}
