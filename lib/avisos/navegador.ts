import type { SuscripcionDelNavegador } from "@/lib/acciones/avisos"

/** What the browser of this device says; `estadoDeAvisos` turns it, with the server's side, into what Coni sees. */
export interface DatosDelDispositivo {
  ios: boolean
  instalada: boolean
  soportado: boolean
  permiso: NotificationPermission | null
  suscrito: boolean
}

export type ResultadoDeActivar = { estado: "activada"; suscripcion: SuscripcionDelNavegador } | { estado: "denegada" }

/** The browser APIs behind notices, as one port, so the screen is tested without a browser that can push. */
export interface PuertoDeAvisos {
  leer(): Promise<DatosDelDispositivo>
  /** Asks the permission (call it from a tap), registers the worker and subscribes. */
  activar(claveVapid: string): Promise<ResultadoDeActivar>
  /** Unsubscribes this device; answers the endpoint that was removed, or null when there was none. */
  desactivar(): Promise<string | null>
}

const LARGO_MAXIMO_DEL_AGENTE = 300

// https://web.dev/articles/push-notifications-subscribing-a-user : the key travels as base64 url-safe text.
function bytesDeLaClave(base64Url: string): Uint8Array<ArrayBuffer> {
  const relleno = "=".repeat((4 - (base64Url.length % 4)) % 4)
  const binario = atob((base64Url + relleno).replace(/-/g, "+").replace(/_/g, "/"))
  return Uint8Array.from(binario, (caracter) => caracter.charCodeAt(0))
}

interface NavegadorConStandalone extends Navigator {
  standalone?: boolean
}

function esIos(): boolean {
  const agente = navigator.userAgent
  // iPadOS asks for the desktop site and says it is a Mac, but a Mac has no touch screen.
  return /iPad|iPhone|iPod/.test(agente) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
}

function estaInstalada(): boolean {
  const navegador: NavegadorConStandalone = navigator
  return window.matchMedia("(display-mode: standalone)").matches || navegador.standalone === true
}

function haySoporte(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window
}

async function suscripcionActual(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator)) return null
  // `getRegistration` never registers: the worker is only installed after she opts in.
  const registro = await navigator.serviceWorker.getRegistration()
  return registro ? registro.pushManager.getSubscription() : null
}

function aSuscripcion(suscripcion: PushSubscription): SuscripcionDelNavegador {
  const { endpoint, keys } = suscripcion.toJSON()
  if (!endpoint || !keys?.p256dh || !keys.auth) throw new Error("El navegador entregó una suscripción incompleta.")
  return {
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    userAgent: navigator.userAgent.slice(0, LARGO_MAXIMO_DEL_AGENTE),
  }
}

export function puertoDelNavegador(): PuertoDeAvisos {
  return {
    async leer() {
      const soportado = haySoporte()
      return {
        ios: esIos(),
        instalada: estaInstalada(),
        soportado,
        permiso: "Notification" in window ? Notification.permission : null,
        suscrito: soportado && (await suscripcionActual()) !== null,
      }
    },

    async activar(claveVapid) {
      // First, still inside her tap: iOS refuses to ask for the permission anywhere else.
      const permiso = await Notification.requestPermission()
      if (permiso !== "granted") return { estado: "denegada" }
      await navigator.serviceWorker.register("/sw.js", { scope: "/" })
      const registro = await navigator.serviceWorker.ready
      const existente = await registro.pushManager.getSubscription()
      const suscripcion =
        existente ??
        (await registro.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: bytesDeLaClave(claveVapid),
        }))
      return { estado: "activada", suscripcion: aSuscripcion(suscripcion) }
    },

    async desactivar() {
      const suscripcion = await suscripcionActual()
      if (!suscripcion) return null
      const { endpoint } = suscripcion
      await suscripcion.unsubscribe()
      return endpoint
    },
  }
}
