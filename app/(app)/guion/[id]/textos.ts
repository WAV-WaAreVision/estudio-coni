import { VENTANA_DESHACER_MS } from "@/lib/dominio/estados"

// Gate 1 copy (design 2026-10-15, section 6), shared by the server page and the client components of the Guion screen:
// a module marked for the client cannot hand plain values to a server component.
export const TEXTO_FALTA_VOZ = "Falta preparar tu voz."
export const TEXTO_PREPARANDO_VOZ = "Estoy preparando tu voz. Tarda unos segundos."
export const TEXTO_ESCUCHA_COMPLETA = "Escucha tu voz completa para firmar."
export const TEXTO_GUARDA_ANTES_DE_VOZ = "Guarda tus cambios antes de grabar tu voz."
export const TEXTO_CAMBIOS_TRAS_LA_VOZ = "Puedes pedir cambios cuando tu voz esté lista."
/** The toast of a signature: the seconds really left of the window, 8 for a fresh one. */
export const textoFirmaste = (quedanMs: number) =>
  `Firmaste. Grabo el video en ${Math.min(VENTANA_DESHACER_MS / 1000, Math.ceil(quedanMs / 1000))} s.`
export const TEXTO_DESHECHO = "Listo, no grabé nada. Puedes seguir revisando."
