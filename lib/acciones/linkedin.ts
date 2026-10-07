import type { SupabaseClient } from "@supabase/supabase-js"
import { estadoCoincide } from "@/lib/acciones/estado-oauth"
import { Falla } from "@/lib/dominio/falla"
import { intercambiarCodigoLinkedin, leerMiembro } from "@/lib/proveedores/linkedin-oauth"
import type { Database } from "@/lib/supabase/database.types"

type Entorno = Record<string, string | undefined>

export interface AppDeLinkedin {
  clientId: string
  clientSecret: string
  redirectUri: string
}

/** The LinkedIn app Federico creates (spec checklist); null until the three variables are set. */
export function leerAppDeLinkedin(entorno: Entorno): AppDeLinkedin | null {
  const {
    LINKEDIN_CLIENT_ID: clientId,
    LINKEDIN_CLIENT_SECRET: clientSecret,
    LINKEDIN_REDIRECT_URI: redirectUri,
  } = entorno
  return clientId && clientSecret && redirectUri ? { clientId, clientSecret, redirectUri } : null
}

export type MotivoDeFalloLinkedin = "estado" | "cancelada" | "rechazada" | "permisos" | "sin_app" | "fallo"
export type ResultadoDeConexionLinkedin =
  | { ok: true; nombre: string | null }
  | { ok: false; motivo: MotivoDeFalloLinkedin }

export interface DepsDeConexionLinkedin {
  /** Coni's session: `conectar_linkedin` only answers to her. */
  db: SupabaseClient<Database>
  app: AppDeLinkedin | null
  ahora: () => string
}

/** The callback of "Conectar LinkedIn" (L2). Whatever fails leaves Vault and `ajustes` as they were. */
export async function terminarConexionLinkedin(
  deps: DepsDeConexionLinkedin,
  llegada: { codigo?: string; estado?: string | null; estadoGuardado?: string | null; errorDeLinkedin?: string | null },
): Promise<ResultadoDeConexionLinkedin> {
  if (!deps.app) return { ok: false, motivo: "sin_app" }
  if (!estadoCoincide(llegada.estadoGuardado, llegada.estado)) return { ok: false, motivo: "estado" }
  if (llegada.errorDeLinkedin) return { ok: false, motivo: "cancelada" }
  if (!llegada.codigo) return { ok: false, motivo: "fallo" }

  try {
    const acceso = await intercambiarCodigoLinkedin({ ...deps.app, codigo: llegada.codigo })
    if (acceso.scopes !== null && !acceso.scopes.includes("w_member_social")) return { ok: false, motivo: "permisos" }
    const { miembro, nombre } = await leerMiembro({ token: acceso.token })
    const expiraEn = new Date(Date.parse(deps.ahora()) + acceso.expiraEnSegundos * 1000).toISOString()
    const { error } = await deps.db.rpc("conectar_linkedin", {
      p_token: acceso.token,
      p_miembro: miembro,
      p_nombre: nombre ?? "",
      p_expira_en: expiraEn,
    })
    if (error) throw new Error(`No pude guardar la conexión de LinkedIn: ${error.message}`, { cause: error })
    return { ok: true, nombre }
  } catch (error) {
    if (error instanceof Falla) return { ok: false, motivo: "rechazada" }
    console.error("No pude conectar LinkedIn", error)
    return { ok: false, motivo: "fallo" }
  }
}

/** "Desconectar" (L4): there is no revoke endpoint (F13), so only our copy goes. */
export async function desconectarLinkedin(db: SupabaseClient<Database>): Promise<object> {
  const { error } = await db.rpc("desconectar_linkedin")
  if (error) throw new Error(`No pude desconectar LinkedIn: ${error.message}`, { cause: error })
  return {}
}
