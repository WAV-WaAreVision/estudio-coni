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
/** Spec 2026-10-17, decision 14: only when ElevenLabs refused the attempt, so the data proves nothing was charged. */
export const TEXTO_INTENTO_SIN_COBRO = "Este intento no se cobró."
export const TEXTO_SIN_SALDO_VOZ = "No alcanza el saldo para preparar tu voz. Avísale a Federico."
export const TEXTO_SIN_SALDO_VIDEO = "No alcanza el saldo para grabar el video. Avísale a Federico."
export const TEXTO_NO_PUDE_GRABAR = "No pude grabar el video. Revisa el guion y vuelve a firmarlo."
export const TEXTO_NO_PUDE_REHACER_VOZ = "No pude grabar tu voz de nuevo."
export const TEXTO_REINTENTA_REHACER_VOZ = "Puedes intentarlo otra vez en Editar el guion."
export const TEXTO_AVISA_A_FEDERICO = "Avísale a Federico."
/** A key he has to fix: telling him comes first, and the paid try becomes secondary. */
export const TEXTO_AVISA_Y_REINTENTA_VOZ = `${TEXTO_AVISA_A_FEDERICO} Cuando lo arregle, puedes intentarlo otra vez.`
export const TEXTO_REINTENTA = "Vuelve a intentarlo con Reintentar."
export const TEXTO_DETENIDO_EN_SUS_PALABRAS = "No puedo seguir grabando por ahora. Avísale a Federico."

// A key ElevenLabs refused, or none saved: trying again gives the same answer, so the text never offers it.
const FALLA_DE_LLAVE = /\b(401|403)\b|\bllave\b/i
export const esFallaDeLlave = (texto: string) => FALLA_DE_LLAVE.test(texto)

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

// LinkedIn carousels (design 2026-10-26, plan D4).
export const TEXTO_CARRUSEL_DE_LINKEDIN = "Carrusel de LinkedIn"
export const TEXTO_ESCRIBIENDO_CARRUSEL = "Estoy escribiendo el carrusel"
export const TEXTO_NO_ESCRIBI_CARRUSEL = "No pude escribir el carrusel"
export const TEXTO_REVISA_LAMINAS = "1. Revisa las láminas"
export const TEXTO_REVISA_POST = "2. Revisa el texto de la publicación"
export const TEXTO_SIN_OBSERVACIONES_CARRUSEL = "Revisé el carrusel y no encontré observaciones. Tú decides."
export const TEXTO_AYUDA_DEL_PEDIDO = "Escríbelo en una frase. Escribo el carrusel de nuevo y este se descarta."
export const TEXTO_CONSECUENCIA_CARRUSEL = "Firmas las láminas y el texto. Todavía no se publica nada."
export const TEXTO_ASI_QUEDO_FIRMADO = "Así quedó firmado"

export const textoCambiosQuedan = (quedan: number) =>
  quedan === 1 ? "Te queda 1 cambio." : `Te quedan ${quedan} cambios.`

export const TEXTO_ARMANDO = "Estoy armando las láminas"
export const TEXTO_ARMANDO_DETALLE = "Tarda un par de minutos. Te aviso cuando estén para que elijas la fecha."
export const TEXTO_NO_ARME = "No pude armar el carrusel"
export const TEXTO_DESLIZA_RIEL = "Desliza para leerlo completo"
export const TEXTO_ASI_SALE = "Así sale en LinkedIn"
export const TEXTO_CUANDO_SALE = "Cuándo sale"
export const TEXTO_CAMBIO_TEXTO = "Vuelve a la firma del texto y cuenta como uno de tus 3 cambios."
export const TEXTO_CAMBIO_DISENO = "Rehago las láminas con el mismo texto. No cuenta como cambio."
export const TEXTO_SIN_LAMINA_PARA_CAMBIO = "Ninguna lámina permite este cambio ahora."
export const TEXTO_PROGRAMADO_CARRUSEL = "A esa hora te dejo el PDF y el texto para que lo subas a LinkedIn."
