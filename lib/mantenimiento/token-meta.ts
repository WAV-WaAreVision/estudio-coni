import type { SupabaseClient } from "@supabase/supabase-js"
import { guardarTokenMeta, leerExpiracionMeta, leerSecreto } from "@/lib/datos/repositorio"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import type { Notificador } from "@/lib/proveedores/avisos"
import { EXPLICACION_RECONECTAR, renovarToken, TokenVencido } from "@/lib/proveedores/instagram"
import type { Database } from "@/lib/supabase/database.types"

export interface DepsTokenMeta {
  /** A `service_role` client. */
  db: SupabaseClient<Database>
  avisos: Notificador
  ahora: () => string
}

export type ResultadoTokenMeta = "sin_token" | "vigente" | "renovado" | "fallo"

const DIA_MS = 86_400_000
/** Instagram's long-lived token lasts 60 days; it is renewed with 10 left, so a week of failures still leaves time. */
const DIAS_PARA_RENOVAR = 10
/** Design A6: Coni is told when fewer than 7 days are left and the renewal is not working. */
const DIAS_PARA_AVISAR = 7

/**
 * Renews Instagram's token before it expires and saves it (design A6). A token whose expiry is unknown is renewed
 * too. When the renewal does not work, WAV is told, and Coni is told when the token is dead or running out.
 */
export async function mantenerTokenMeta(deps: DepsTokenMeta): Promise<ResultadoTokenMeta> {
  const token = await leerSecreto(deps.db, "meta")
  if (!token) return "sin_token"

  const ahora = Date.parse(deps.ahora())
  const expira = await leerExpiracionMeta(deps.db)
  const dias = expira === null ? null : (Date.parse(expira) - ahora) / DIA_MS
  if (dias !== null && dias >= DIAS_PARA_RENOVAR) return "vigente"

  const pocoTiempo = dias !== null && dias < DIAS_PARA_AVISAR
  try {
    const renovado = await renovarToken({ token })
    await guardarTokenMeta(deps.db, renovado.token, new Date(ahora + renovado.expiraEnSegundos * 1000).toISOString())
    return "renovado"
  } catch (error) {
    if (error instanceof TokenVencido) {
      await deps.avisos.aConi(EXPLICACION_RECONECTAR, true)
      await deps.avisos.aWav("El token de Instagram venció", error.message)
      return "fallo"
    }
    if (error instanceof FallaDeConfiguracion) {
      if (pocoTiempo) await deps.avisos.aConi(mensajeDeVencimiento(dias), true)
      await deps.avisos.aWav("No pude renovar el token de Instagram", error.message)
      return "fallo"
    }
    // A temporary failure: tomorrow's run tries again, and the last week is no time to stay quiet.
    if (pocoTiempo) await deps.avisos.aConi(mensajeDeVencimiento(dias), true)
    throw error
  }
}

function mensajeDeVencimiento(dias: number | null): string {
  const restantes = Math.max(0, Math.ceil(dias ?? 0))
  const cuando = restantes === 1 ? "1 día" : `${restantes} días`
  return `Tu conexión con Instagram vence en ${cuando} y no pude renovarla. WAV ya está revisando.`
}
