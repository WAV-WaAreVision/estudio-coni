import { VENTANA_DESHACER_MS } from "@/lib/dominio/estados"

// Gate 1 copy (design 2026-10-15, section 6), shared by the server page and the client components of the Guion screen:
// a module marked for the client cannot hand plain values to a server component.
export const TEXTO_FALTA_VOZ = "Falta preparar tu voz."
export const TEXTO_PREPARANDO_VOZ = "Estoy preparando tu voz. Tarda unos segundos."
export const TEXTO_GUARDA_ANTES_DE_VOZ = "Guarda tus cambios antes de grabar tu voz."
export const TEXTO_CAMBIOS_TRAS_LA_VOZ = "Puedes pedir cambios cuando tu voz esté lista."
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

// Exit critique 3: what happened in her words when the app only has a provider's text (that goes to "Detalle para WAV").
export const TEXTO_REINTENTA_VOZ = "Vuelve a intentarlo con Preparar mi voz."
export const TEXTO_SIN_SALDO_VOZ = "No alcanza el saldo para preparar tu voz. Avísale a Federico."
export const TEXTO_SIN_SALDO_VIDEO = "No alcanza el saldo para grabar el video. Avísale a Federico."
export const TEXTO_NO_PUDE_GRABAR = "No pude grabar el video. Revisa el guion y vuelve a firmarlo."
export const TEXTO_NO_PUDE_REHACER_VOZ =
  "No pude grabar tu voz de nuevo. Puedes intentarlo otra vez en Editar el guion."
export const TEXTO_REINTENTA = "Vuelve a intentarlo con Reintentar."
export const TEXTO_DETENIDO_EN_SUS_PALABRAS = "No puedo seguir grabando por ahora. Avísale a Federico."

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
