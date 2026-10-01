import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { type CanalDeAviso, type DatosDeAviso, type MensajePush, mensajePush, TITULO_DE_PUSH } from "@/lib/avisos/tipos"
import {
  anotarEntrega,
  anotarFallo,
  listarSuscripciones,
  quitarSuscripcion,
  type SuscripcionGuardada,
} from "@/lib/datos/suscripciones"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import { exigirEnv } from "@/lib/env"
import type { Database } from "@/lib/supabase/database.types"
import { type ServicioPush, servicioPushReal } from "./push"

/**
 * Where alerts go (design A9). Coni gets plain Spanish; WAV gets the technical detail. The tasks only see this port:
 * `notificadorResend` in production and `notificadorEnMemoria` in tests.
 */
export interface Notificador {
  /**
   * `urgente` is an alert that goes out now; the rest can wait for the daily summary (08:30 America/Santiago).
   * `mensaje` is what an email says; a push is worded from `aviso.tipo` (a lock screen is public). Answers the channel
   * that carried it.
   */
  aConi(mensaje: string, urgente: boolean, aviso: DatosDeAviso): Promise<CanalDeAviso>
  /** The one summary of the day: `cuerpoPush` is its short line, `texto` the whole thing for an email. */
  resumenAConi(resumen: ResumenDelDia): Promise<CanalDeAviso>
  aWav(asunto: string, detalle: string): Promise<void>
}

export interface ResumenDelDia {
  cuerpoPush: string
  texto: string
}

export interface NotificadorEnMemoria extends Notificador {
  readonly aConiEnviados: { mensaje: string; urgente: boolean }[]
  /** The identity (kind, key, piece) of each notice in `aConiEnviados`, in the same order. */
  readonly avisosEnviados: DatosDeAviso[]
  readonly resumenesEnviados: ResumenDelDia[]
  readonly aWavEnviados: { asunto: string; detalle: string }[]
}

/** A test double that remembers what it was asked to send. */
export function notificadorEnMemoria(): NotificadorEnMemoria {
  const aConiEnviados: NotificadorEnMemoria["aConiEnviados"] = []
  const avisosEnviados: DatosDeAviso[] = []
  const resumenesEnviados: ResumenDelDia[] = []
  const aWavEnviados: NotificadorEnMemoria["aWavEnviados"] = []
  return {
    aConiEnviados,
    avisosEnviados,
    resumenesEnviados,
    aWavEnviados,
    async aConi(mensaje, urgente, aviso) {
      aConiEnviados.push({ mensaje, urgente })
      avisosEnviados.push(aviso)
      return "correo"
    },
    async resumenAConi(resumen) {
      resumenesEnviados.push(resumen)
      return "correo"
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
 * Email through Resend. It sends what it is given, when it is given: deciding what waits for the summary is the job
 * of `notificadorConRegistro`, and `urgente` only changes the subject.
 */
export function notificadorResend(opciones: OpcionesResend): Notificador {
  return {
    async aConi(mensaje, urgente) {
      await enviar(opciones, {
        a: opciones.correoConi,
        asunto: urgente ? "Aviso importante de tu estudio" : "Aviso de tu estudio",
        texto: mensaje,
      })
      return "correo"
    },
    async resumenAConi(resumen) {
      await enviar(opciones, { a: opciones.correoConi, asunto: "Resumen de tu estudio", texto: resumen.texto })
      return "correo"
    },
    aWav: (asunto, detalle) => enviar(opciones, { a: opciones.correoWav, asunto, texto: detalle }),
  }
}

export interface OpcionesPush {
  /** A `service_role` client: it reads the keys of her devices. */
  db: SupabaseClient<Database>
  servicio: ServicioPush
  /** What carries a notice when there is no live device or the push failed, and everything for WAV. */
  correo: Notificador
  ahora?: () => string
}

/**
 * Web Push to her installed app, with the email notifier as the fallback (design "Avisos a Coni"). A device the push
 * service no longer knows (404/410) is deleted; one that fails for now stays and the failure is counted. The notice is
 * a push if at least one device took it, an email otherwise.
 */
export function notificadorPush(opciones: OpcionesPush): Notificador {
  const { db, servicio, correo } = opciones
  const ahora = opciones.ahora ?? (() => new Date().toISOString())

  async function aUnaSuscripcion(
    suscripcion: SuscripcionGuardada,
    mensaje: MensajePush,
    urgente: boolean,
  ): Promise<boolean> {
    const resultado = await servicio.enviar(suscripcion, mensaje, { urgente })
    switch (resultado.estado) {
      case "enviado":
        await anotarEntrega(db, suscripcion.id, ahora())
        return true
      case "caducada":
        await quitarSuscripcion(db, suscripcion.id)
        return false
      case "fallo":
        await anotarFallo(db, suscripcion)
        return false
    }
  }

  async function porPush(mensaje: MensajePush, urgente: boolean): Promise<boolean> {
    let entregado = false
    for (const suscripcion of await listarSuscripciones(db)) {
      if (await aUnaSuscripcion(suscripcion, mensaje, urgente)) entregado = true
    }
    return entregado
  }

  return {
    async aConi(mensaje, urgente, aviso) {
      if (await porPush(mensajePush(aviso), urgente)) return "push"
      return correo.aConi(mensaje, urgente, aviso)
    },
    async resumenAConi(resumen) {
      if (await porPush({ titulo: TITULO_DE_PUSH, cuerpo: resumen.cuerpoPush, url: "/" }, false)) return "push"
      return correo.resumenAConi(resumen)
    },
    aWav: (asunto, detalle) => correo.aWav(asunto, detalle),
  }
}

/**
 * The notifier the tasks use in production, from the variables of the Trigger.dev environment. Without any `VAPID_*`
 * variable push is simply not set up yet and everything goes by email; with some of them it fails loudly instead of
 * quietly dropping the push.
 */
export function avisosReales(entorno: Record<string, string | undefined> = process.env): Notificador {
  const correo = notificadorResend({
    clave: exigirEnv("RESEND_API_KEY", entorno.RESEND_API_KEY),
    remitente: exigirEnv("AVISOS_REMITENTE", entorno.AVISOS_REMITENTE),
    correoConi: exigirEnv("AVISOS_CORREO_CONI", entorno.AVISOS_CORREO_CONI),
    correoWav: exigirEnv("AVISOS_CORREO_WAV", entorno.AVISOS_CORREO_WAV),
  })
  const sinPush = !entorno.VAPID_PUBLIC_KEY && !entorno.VAPID_PRIVATE_KEY && !entorno.VAPID_SUBJECT
  if (sinPush) return correo
  const db = createClient<Database>(
    exigirEnv("SUPABASE_URL", entorno.SUPABASE_URL),
    exigirEnv("SUPABASE_SERVICE_ROLE_KEY", entorno.SUPABASE_SERVICE_ROLE_KEY),
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  return notificadorPush({ db, servicio: servicioPushReal(entorno), correo })
}
