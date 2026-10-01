import type { AuthError } from "@supabase/supabase-js"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"

type Respuesta = { error: Pick<AuthError, "message" | "status" | "code"> | null }

/** The two calls of Supabase Auth this sign-in needs; a test passes a fake. */
export interface AuthDeIngreso {
  signInWithOtp(args: { email: string; options: { shouldCreateUser: false } }): PromiseLike<Respuesta>
  verifyOtp(args: { email: string; token: string; type: "email" }): PromiseLike<Respuesta>
}

export interface DepsIngreso {
  auth: AuthDeIngreso
  correoConi: string
}

export type ResultadoIngreso = { ok: true } | { ok: false; error: string }

const ERROR_GENERICO = "No pude mandar el código. Inténtalo de nuevo en un rato."
const ERROR_CODIGO_INVALIDO = "Ese código no sirve o ya venció. Pide otro."

/** The only address the app signs in: Coni is the single user, so nobody types an email. */
export function correoDeConi(entorno: Record<string, string | undefined>): string {
  const correo = (entorno.CORREO_CONI || entorno.AVISOS_CORREO_CONI)?.trim()
  if (!correo) {
    throw new FallaDeConfiguracion("Falta CORREO_CONI (o AVISOS_CORREO_CONI): sin él nadie puede entrar a la app.")
  }
  return correo
}

export function enmascararCorreo(correo: string): string {
  const [local = "", dominio = ""] = correo.split("@")
  return `${local.slice(0, 1)}•••@${dominio}`
}

function esperaDelError(mensaje: string): string | null {
  const segundos = /(\d+)\s*seconds?/i.exec(mensaje)?.[1]
  return segundos ? `${segundos} segundos` : null
}

const estaLimitado = (error: Pick<AuthError, "status" | "code">) =>
  error.status === 429 || error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit"

export async function pedirCodigo(deps: DepsIngreso): Promise<ResultadoIngreso> {
  const { error } = await deps.auth.signInWithOtp({
    email: deps.correoConi,
    // Coni's user exists from the invitation: a mistyped address must never create another one.
    options: { shouldCreateUser: false },
  })
  if (!error) return { ok: true }
  if (estaLimitado(error)) {
    const espera = esperaDelError(error.message)
    return {
      ok: false,
      error: espera ? `Espera ${espera} para pedir otro código.` : "Espera un momento para pedir otro código.",
    }
  }
  console.error("No pude mandar el código de ingreso", error)
  return { ok: false, error: ERROR_GENERICO }
}

export async function verificarCodigo(deps: DepsIngreso, codigo: string): Promise<ResultadoIngreso> {
  const token = codigo.trim()
  if (!/^\d{6}$/.test(token)) return { ok: false, error: "El código tiene seis números." }
  const { error } = await deps.auth.verifyOtp({ email: deps.correoConi, token, type: "email" })
  if (!error) return { ok: true }
  if (estaLimitado(error)) {
    return { ok: false, error: "Demasiados intentos. Espera un momento y pide otro código." }
  }
  if (error.code === "otp_expired" || error.status === 403 || error.status === 400) {
    return { ok: false, error: ERROR_CODIGO_INVALIDO }
  }
  console.error("No pude verificar el código de ingreso", error)
  return { ok: false, error: "No pude revisar el código. Inténtalo de nuevo en un rato." }
}
