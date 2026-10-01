import { generateRequestDetails } from "web-push"
import type { MensajePush } from "@/lib/avisos/tipos"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import { exigirEnv } from "@/lib/env"
import { baseDe } from "./bases"

export interface SuscripcionPush {
  endpoint: string
  p256dh: string
  auth: string
}

export type ResultadoPush =
  | { estado: "enviado" }
  /** 404 or 410: the push service forgot this device; the subscription must be deleted. */
  | { estado: "caducada" }
  | { estado: "fallo"; detalle: string }

export interface ServicioPush {
  enviar(suscripcion: SuscripcionPush, mensaje: MensajePush, opciones: { urgente: boolean }): Promise<ResultadoPush>
}

export interface OpcionesVapid {
  clavePublica: string
  clavePrivada: string
  /** `mailto:` or `https:` address the push service can reach WAV at (RFC 8292). */
  asunto: string
  /** Local E2E only: replaces the origin of every endpoint (see `servicioPushReal`). */
  base?: string
}

// RFC 8030: a message that is not delivered in this time is useless to Coni (a summary of yesterday).
const VIDA_DEL_MENSAJE_S = 86_400
// RFC 8291 allows 4096 bytes in the push; web-push's own limit is 3993 after encryption overhead.
const MAXIMO_DE_CARGA_BYTES = 3000
const ESPERA_MS = 15_000
const ASUNTO_VALIDO = /^(mailto:[^\s@]+@[^\s@]+|https:\/\/\S+)$/

function exigirClave(nombre: string, valor: string, bytes: number) {
  if (Buffer.from(valor, "base64url").length !== bytes) {
    throw new FallaDeConfiguracion(`${nombre} no es una llave VAPID válida (${bytes} bytes en base64 url-safe).`)
  }
}

/** The path and query of the endpoint on another origin: the E2E sends to its fake push service this way. */
function conBase(endpoint: string, base: string): string {
  const original = new URL(endpoint)
  return `${base}${original.pathname}${original.search}`
}

/**
 * Web Push with VAPID. The request is built by `web-push` (encryption of RFC 8291 and the signature of RFC 8292) and
 * sent with `fetch`, so there is a timeout, MSW sees it in tests and nothing goes through `https.request`.
 * The endpoint is a capability: it never appears in an error or in a log.
 */
export function servicioPushVapid(opciones: OpcionesVapid): ServicioPush {
  exigirClave("VAPID_PUBLIC_KEY", opciones.clavePublica, 65)
  exigirClave("VAPID_PRIVATE_KEY", opciones.clavePrivada, 32)
  if (!ASUNTO_VALIDO.test(opciones.asunto)) {
    throw new FallaDeConfiguracion("VAPID_SUBJECT debe ser una dirección mailto: o https:.")
  }
  return {
    async enviar(suscripcion, mensaje, { urgente }) {
      const carga = JSON.stringify(mensaje)
      if (Buffer.byteLength(carga) > MAXIMO_DE_CARGA_BYTES) {
        throw new Error("El mensaje de push es demasiado grande.")
      }
      const detalles = generateRequestDetails(
        { endpoint: suscripcion.endpoint, keys: { p256dh: suscripcion.p256dh, auth: suscripcion.auth } },
        carga,
        {
          TTL: VIDA_DEL_MENSAJE_S,
          urgency: urgente ? "high" : "normal",
          vapidDetails: {
            subject: opciones.asunto,
            publicKey: opciones.clavePublica,
            privateKey: opciones.clavePrivada,
          },
        },
      )
      const destino = opciones.base ? conBase(detalles.endpoint, opciones.base) : detalles.endpoint
      let respuesta: Response
      try {
        respuesta = await fetch(destino, {
          method: "POST",
          headers: detalles.headers,
          body: new Uint8Array(detalles.body),
          signal: AbortSignal.timeout(ESPERA_MS),
        })
      } catch (error) {
        const causa = error instanceof Error ? error.name : "error desconocido"
        return { estado: "fallo", detalle: `No pude conectar con el servicio de push (${causa}).` }
      }
      if (respuesta.ok) return { estado: "enviado" }
      if (respuesta.status === 404 || respuesta.status === 410) return { estado: "caducada" }
      return { estado: "fallo", detalle: `El servicio de push respondió HTTP ${respuesta.status}.` }
    },
  }
}

type Entorno = Record<string, string | undefined>

/** The push service the tasks and the app use, from `VAPID_*`. `PUSH_BASE_URL` is for the local E2E only. */
export function servicioPushReal(entorno: Entorno = process.env): ServicioPush {
  const base = baseDe(entorno, "PUSH_BASE_URL", "")
  return servicioPushVapid({
    clavePublica: exigirEnv("VAPID_PUBLIC_KEY", entorno.VAPID_PUBLIC_KEY),
    clavePrivada: exigirEnv("VAPID_PRIVATE_KEY", entorno.VAPID_PRIVATE_KEY),
    asunto: exigirEnv("VAPID_SUBJECT", entorno.VAPID_SUBJECT),
    ...(base ? { base } : {}),
  })
}
