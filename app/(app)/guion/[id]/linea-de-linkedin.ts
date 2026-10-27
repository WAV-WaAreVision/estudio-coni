import { TEXTO_PROGRAMADO_CARRUSEL } from "./textos"

export const TEXTO_SALE_SOLO_EN_LINKEDIN = "Se publica solo en LinkedIn a esa hora."
export const TEXTO_LINKEDIN_A_MANO = "LinkedIn no está conectado: te lo dejo para subir a mano."
export const TEXTO_PROGRAMADO_SOLO = "A esa hora se publica solo en LinkedIn."

/**
 * Whether her LinkedIn connection will still be alive at `instante` (design P3-3: the expiry is known, so a token that
 * ends before the chosen date already says "a mano"). `expiraEn` is null when LinkedIn is not connected.
 */
export function saleSoloEnLinkedin(expiraEn: string | null, instante: string): boolean {
  return expiraEn !== null && Date.parse(expiraEn) > Date.parse(instante)
}

/** The line under the date at a carousel's gate 2. */
export function lineaDeLinkedin(expiraEn: string | null, publicarEn: string): string {
  return saleSoloEnLinkedin(expiraEn, publicarEn) ? TEXTO_SALE_SOLO_EN_LINKEDIN : TEXTO_LINKEDIN_A_MANO
}

/** What a scheduled carousel's screen says will happen at its time (decision P9). */
export function detalleDeProgramado(expiraEn: string | null, publicarEn: string): string {
  return saleSoloEnLinkedin(expiraEn, publicarEn) ? TEXTO_PROGRAMADO_SOLO : TEXTO_PROGRAMADO_CARRUSEL
}
