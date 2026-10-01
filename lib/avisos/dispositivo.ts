/** What the browser of this device says about notices, plus whether the server has keys to send them. */
export interface EntornoDeAvisos {
  /** The server has a VAPID public key: without it nothing can be sent. */
  configurado: boolean
  ios: boolean
  /** The app was opened from the home screen (`display-mode: standalone`). */
  instalada: boolean
  /** The browser has service workers, the Push API and notifications. Safari on iOS hides them outside an installed app. */
  soportado: boolean
  permiso: NotificationPermission | null
  /** This device has a live push subscription. */
  suscrito: boolean
}

export type EstadoDeAvisos = "no_disponible" | "instalar" | "listo" | "denegado" | "activo"

/**
 * Which of the five things the "Avisos en tu celular" section shows. The order matters: an iPhone in Safari reports no
 * push support at all, and the answer is to install the app, not "your phone cannot".
 */
export function estadoDeAvisos(entorno: EntornoDeAvisos): EstadoDeAvisos {
  if (!entorno.configurado) return "no_disponible"
  if (entorno.ios && !entorno.instalada) return "instalar"
  if (!entorno.soportado) return "no_disponible"
  if (entorno.permiso === "denied") return "denegado"
  if (entorno.suscrito && entorno.permiso === "granted") return "activo"
  return "listo"
}
