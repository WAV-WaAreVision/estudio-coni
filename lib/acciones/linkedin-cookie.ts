export const COOKIE_DE_ESTADO_LINKEDIN = "estudio_linkedin_estado"
export const RUTA_DE_LA_COOKIE_LINKEDIN = "/api/linkedin"
const DIEZ_MINUTOS = 10 * 60

export function opcionesDeLaCookieLinkedin(https: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: https,
    path: RUTA_DE_LA_COOKIE_LINKEDIN,
    maxAge: DIEZ_MINUTOS,
  }
}
