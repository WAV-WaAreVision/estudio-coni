import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import { exigirEnv } from "@/lib/env"

/**
 * Where alerts go (design A9). Coni gets plain Spanish; WAV gets the technical detail. The tasks only see this port:
 * `notificadorResend` in production and `notificadorEnMemoria` in tests.
 */
export interface Notificador {
  /** `urgente` is an alert that goes out now; the rest can wait for the daily summary (08:30 America/Santiago). */
  aConi(mensaje: string, urgente: boolean): Promise<void>
  aWav(asunto: string, detalle: string): Promise<void>
}

export interface NotificadorEnMemoria extends Notificador {
  readonly aConiEnviados: { mensaje: string; urgente: boolean }[]
  readonly aWavEnviados: { asunto: string; detalle: string }[]
}

/** A test double that remembers what it was asked to send. */
export function notificadorEnMemoria(): NotificadorEnMemoria {
  const aConiEnviados: NotificadorEnMemoria["aConiEnviados"] = []
  const aWavEnviados: NotificadorEnMemoria["aWavEnviados"] = []
  return {
    aConiEnviados,
    aWavEnviados,
    async aConi(mensaje, urgente) {
      aConiEnviados.push({ mensaje, urgente })
    },
    async aWav(asunto, detalle) {
      aWavEnviados.push({ asunto, detalle })
    },
  }
}

export interface OpcionesResend {
  clave: string
  /** `Name <email@example.com>` on a domain verified in Resend (design A5: Coni's own domain). */
  remitente: string
  correoConi: string
  correoWav: string
}

// https://resend.com/docs/api-reference/emails/send-email : `POST https://api.resend.com/emails` with
// `Authorization: Bearer <key>` and a JSON body with `from`, `to` (string or array), `subject` and `text`; it answers
// `{ "id": "..." }`. Errors by status (https://resend.com/docs/api-reference/errors): 400, 401, 403 and 422 will not
// change by retrying; 409, 429, 500 and 503 are temporary.
const URL_RESEND = "https://api.resend.com/emails"
const ESPERA_ENVIAR_MS = 30_000
const LARGO_MAXIMO = 400

function sinClave(texto: string, clave: string): string {
  return clave ? texto.split(clave).join("[llave]") : texto
}

function detalleDeResend(cuerpo: string): string {
  const texto = cuerpo.trim()
  try {
    const datos: unknown = JSON.parse(texto)
    if (typeof datos === "object" && datos !== null && "message" in datos && typeof datos.message === "string") {
      return datos.message.trim().slice(0, LARGO_MAXIMO) || "sin detalle"
    }
  } catch (error) {
    // Not JSON (a gateway page): the raw text is the best explanation there is.
    if (!(error instanceof SyntaxError)) throw error
  }
  return texto.slice(0, LARGO_MAXIMO) || "sin detalle"
}

async function enviar(opciones: OpcionesResend, mensaje: { a: string; asunto: string; texto: string }) {
  let respuesta: Response
  try {
    respuesta = await fetch(URL_RESEND, {
      method: "POST",
      headers: { Authorization: `Bearer ${opciones.clave}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: opciones.remitente, to: [mensaje.a], subject: mensaje.asunto, text: mensaje.texto }),
      signal: AbortSignal.timeout(ESPERA_ENVIAR_MS),
    })
  } catch (error) {
    throw new Error("No pude conectar con Resend.", { cause: error })
  }
  if (respuesta.ok) return
  const detalle = sinClave(detalleDeResend(await respuesta.text()), opciones.clave)
  const mensajeDeError = `Resend respondió HTTP ${respuesta.status}: ${detalle}`
  const temporal = respuesta.status === 409 || respuesta.status === 429 || respuesta.status >= 500
  throw temporal || respuesta.status < 400 ? new Error(mensajeDeError) : new FallaDeConfiguracion(mensajeDeError)
}

/**
 * Email through Resend. Both kinds go out at once: the 08:30 summary of design A9 needs the notifications table of
 * the app (Plan 5), so for now `urgente` only changes the subject.
 */
export function notificadorResend(opciones: OpcionesResend): Notificador {
  return {
    aConi: (mensaje, urgente) =>
      enviar(opciones, {
        a: opciones.correoConi,
        asunto: urgente ? "Aviso importante de tu estudio" : "Aviso de tu estudio",
        texto: mensaje,
      }),
    aWav: (asunto, detalle) => enviar(opciones, { a: opciones.correoWav, asunto, texto: detalle }),
  }
}

/** The notifier the tasks use in production, from the variables of the Trigger.dev environment. */
export function avisosReales(): Notificador {
  return notificadorResend({
    clave: exigirEnv("RESEND_API_KEY", process.env.RESEND_API_KEY),
    remitente: exigirEnv("AVISOS_REMITENTE", process.env.AVISOS_REMITENTE),
    correoConi: exigirEnv("AVISOS_CORREO_CONI", process.env.AVISOS_CORREO_CONI),
    correoWav: exigirEnv("AVISOS_CORREO_WAV", process.env.AVISOS_CORREO_WAV),
  })
}
