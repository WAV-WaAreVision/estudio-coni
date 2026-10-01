import { randomBytes, timingSafeEqual } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { Falla } from "@/lib/dominio/falla"
import { aLargaDuracion, intercambiarCodigo, leerCuenta } from "@/lib/proveedores/instagram-oauth"
import type { Database } from "@/lib/supabase/database.types"

type Entorno = Record<string, string | undefined>

export interface AppDeMeta {
  appId: string
  appSecret: string
  redirectUri: string
}

/** The Meta app Coni connects through (design A6); null until WAV has set the three variables. */
export function leerAppDeMeta(entorno: Entorno): AppDeMeta | null {
  const { META_APP_ID: appId, META_APP_SECRET: appSecret, META_REDIRECT_URI: redirectUri } = entorno
  return appId && appSecret && redirectUri ? { appId, appSecret, redirectUri } : null
}

/** A one-use value that goes out with the redirect and must come back: it proves that she started the connection. */
export function nuevoEstado(): string {
  return randomBytes(32).toString("hex")
}

export function estadoCoincide(guardado: string | null | undefined, recibido: string | null | undefined): boolean {
  if (!guardado || !recibido) return false
  const a = Buffer.from(guardado)
  const b = Buffer.from(recibido)
  return a.length === b.length && timingSafeEqual(a, b)
}

export type MotivoDeFallo = "estado" | "cancelada" | "rechazada" | "sin_app" | "fallo"
export type ResultadoDeConexion = { ok: true; usuario: string | null } | { ok: false; motivo: MotivoDeFallo }

export interface DepsDeConexion {
  /** Coni's session: `conectar_instagram` only answers to her. */
  db: SupabaseClient<Database>
  app: AppDeMeta | null
  ahora: () => string
}

/**
 * The callback of "Conectar Instagram": checks the state, trades the code for the 60 day token, reads the account and
 * saves all of it in one database call. Whatever fails leaves Vault and `ajustes` as they were.
 */
export async function terminarConexion(
  deps: DepsDeConexion,
  llegada: {
    codigo?: string
    estado?: string | null
    estadoGuardado?: string | null
    errorDeInstagram?: string | null
  },
): Promise<ResultadoDeConexion> {
  if (!deps.app) return { ok: false, motivo: "sin_app" }
  if (!estadoCoincide(llegada.estadoGuardado, llegada.estado)) return { ok: false, motivo: "estado" }
  if (llegada.errorDeInstagram) return { ok: false, motivo: "cancelada" }
  if (!llegada.codigo) return { ok: false, motivo: "fallo" }

  try {
    const corto = await intercambiarCodigo({ ...deps.app, codigo: llegada.codigo })
    const largo = await aLargaDuracion({ appSecret: deps.app.appSecret, token: corto })
    const cuenta = await leerCuenta({ token: largo.token })
    const expiraEn = new Date(Date.parse(deps.ahora()) + largo.expiraEnSegundos * 1000).toISOString()
    const { error } = await deps.db.rpc("conectar_instagram", {
      p_token: largo.token,
      p_cuenta: cuenta.cuentaId,
      p_expira_en: expiraEn,
    })
    if (error) throw new Error(`No pude guardar la conexión de Instagram: ${error.message}`, { cause: error })
    return { ok: true, usuario: cuenta.usuario }
  } catch (error) {
    if (error instanceof Falla) return { ok: false, motivo: "rechazada" }
    console.error("No pude conectar Instagram", error)
    return { ok: false, motivo: "fallo" }
  }
}
