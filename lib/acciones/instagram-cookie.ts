export const COOKIE_DE_ESTADO = "estudio_meta_estado"
export const RUTA_DE_LA_COOKIE = "/api/meta"
const DIEZ_MINUTOS = 10 * 60

/** Options of the cookie that holds the state: the browser keeps it only for the callback, out of reach of scripts. */
export function opcionesDeLaCookie(https: boolean) {
  return { httpOnly: true, sameSite: "lax" as const, secure: https, path: RUTA_DE_LA_COOKIE, maxAge: DIEZ_MINUTOS }
}
