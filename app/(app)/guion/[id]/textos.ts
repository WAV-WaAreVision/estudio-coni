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

// Soft UI copy (design 2026-10-16, decisions 9, 10 and 13, and its copy table).
export const TEXTO_PEDIR_CAMBIOS = "Escribo un guion nuevo y este se descarta."
export const TEXTO_SIN_OBSERVACIONES = "Claude revisó el guion y no encontró observaciones. Tú decides."
export const TEXTO_NO_PUDE_PREPARAR_VOZ = "No pude preparar tu voz."
export const TEXTO_DESHAZLO = "Si te arrepientes, deshazlo ahora. No se cobra nada."
export const TEXTO_GRABANDO = "Estoy grabando tu video."
export const TEXTO_GRABANDO_DETALLE = "Unos 5 min. Te aviso cuando esté listo."
export const TEXTO_NO_TERMINE = "No pude terminar el video."
export const TEXTO_NO_ESCRIBI = "No pude escribir el guion"
export const TEXTO_VIDEO_DETENIDO = "El video está detenido"

/** "Grabo tu video en 8 s": the seconds really left of the undo window, computed once (decision 10). */
export const textoGraboEn = (quedanMs: number) =>
  `Grabo tu video en ${Math.min(VENTANA_DESHACER_MS / 1000, Math.ceil(quedanMs / 1000))} s`

/** A voice that could not be made (decision 9, step 4): its title, and the rest of the reason as its detail. */
export function separarFallaDeVoz(explicacion: string): { titulo: string; detalle: string | null } {
  if (!explicacion.startsWith(TEXTO_NO_PUDE_PREPARAR_VOZ))
    return { titulo: TEXTO_NO_PUDE_PREPARAR_VOZ, detalle: explicacion }
  const resto = explicacion.slice(TEXTO_NO_PUDE_PREPARAR_VOZ.length).trim()
  return { titulo: TEXTO_NO_PUDE_PREPARAR_VOZ, detalle: resto === "" ? null : resto }
}
