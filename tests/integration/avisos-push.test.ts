import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest"
import type { MensajePush } from "@/lib/avisos/tipos"
import { notificadorEnMemoria, notificadorPush } from "@/lib/proveedores/avisos"
import type { ResultadoPush, ServicioPush, SuscripcionPush } from "@/lib/proveedores/push"
import { CONI, pool } from "./db"
import { clienteDeServicio } from "./servicio"

afterAll(() => pool.end())

const DATOS = { tipo: "guion_listo", clave: "guion_listo:p1:0" } as const
const TEXTO = "Tu guion «El deseo se esconde» está listo para revisar."

interface Envio {
  endpoint: string
  mensaje: MensajePush
  urgente: boolean
}

/** The push service is the outside world: a double that answers by endpoint and remembers what it was sent. */
function servicioFalso(respuestas: Record<string, ResultadoPush>) {
  const envios: Envio[] = []
  const servicio: ServicioPush = {
    async enviar(suscripcion: SuscripcionPush, mensaje, { urgente }) {
      envios.push({ endpoint: suscripcion.endpoint, mensaje, urgente })
      return respuestas[suscripcion.endpoint] ?? { estado: "enviado" }
    },
  }
  return { servicio, envios }
}

async function suscribir(endpoint: string): Promise<void> {
  await pool.query(
    "insert into public.suscripciones_push (user_id, endpoint, p256dh, auth) values ($1, $2, 'p', 'a')",
    [CONI, endpoint],
  )
}

async function filas() {
  const { rows } = await pool.query<{ endpoint: string; fallos: number; ultimo_ok_en: Date | null }>(
    "select endpoint, fallos, ultimo_ok_en from public.suscripciones_push order by endpoint",
  )
  return rows
}

function armar(respuestas: Record<string, ResultadoPush> = {}) {
  const correo = notificadorEnMemoria()
  const falso = servicioFalso(respuestas)
  const notificador = notificadorPush({ db: clienteDeServicio(), servicio: falso.servicio, correo })
  return { notificador, correo, ...falso }
}

beforeEach(() => pool.query("delete from public.suscripciones_push"))
afterEach(() => pool.query("delete from public.suscripciones_push"))

describe("notificadorPush", () => {
  it("sends a push to her device, with words chosen by the kind and never the notice's own text", async () => {
    await suscribir("https://push.test/a")
    const { notificador, correo, envios } = armar()
    expect(await notificador.aConi(TEXTO, false, DATOS)).toBe("push")
    expect(envios).toEqual([
      {
        endpoint: "https://push.test/a",
        mensaje: { titulo: "Estudio de Coni", cuerpo: "Tienes un guion listo para revisar", url: "/" },
        urgente: false,
      },
    ])
    expect(correo.aConiEnviados).toEqual([])
  })

  it("opens the piece the notice is about", async () => {
    await suscribir("https://push.test/a")
    const { notificador, envios } = armar()
    await notificador.aConi(TEXTO, false, { ...DATOS, piezaId: "7c9e6679-7425-40de-944b-e07fc1f90ae7" })
    expect(envios[0]?.mensaje.url).toBe("/guion/7c9e6679-7425-40de-944b-e07fc1f90ae7")
  })

  it("passes the urgency on to the push service", async () => {
    await suscribir("https://push.test/a")
    const { notificador, envios } = armar()
    await notificador.aConi("Falló algo.", true, { tipo: "error_definitivo", clave: "e" })
    expect(envios[0]?.urgente).toBe(true)
  })

  it("falls back to email when she has not installed the app or asked for notices", async () => {
    const { notificador, correo, envios } = armar()
    expect(await notificador.aConi(TEXTO, false, DATOS)).toBe("correo")
    expect(envios).toEqual([])
    expect(correo.aConiEnviados).toEqual([{ mensaje: TEXTO, urgente: false }])
    expect(correo.avisosEnviados).toEqual([DATOS])
  })

  it("deletes a device the push service forgot and falls back to email if it was the only one", async () => {
    await suscribir("https://push.test/muerta")
    const { notificador, correo } = armar({ "https://push.test/muerta": { estado: "caducada" } })
    expect(await notificador.aConi(TEXTO, false, DATOS)).toBe("correo")
    expect(await filas()).toEqual([])
    expect(correo.aConiEnviados).toHaveLength(1)
  })

  it("keeps a device that failed for now, counts the failure and falls back to email", async () => {
    await suscribir("https://push.test/a")
    const { notificador, correo } = armar({ "https://push.test/a": { estado: "fallo", detalle: "HTTP 503" } })
    expect(await notificador.aConi(TEXTO, false, DATOS)).toBe("correo")
    expect((await filas()).map((f) => [f.endpoint, f.fallos])).toEqual([["https://push.test/a", 1]])
    expect(correo.aConiEnviados).toHaveLength(1)
  })

  it("is a push as soon as one of her devices received it, even if another is dead", async () => {
    await suscribir("https://push.test/a")
    await suscribir("https://push.test/b")
    const { notificador, correo } = armar({ "https://push.test/a": { estado: "caducada" } })
    expect(await notificador.aConi(TEXTO, false, DATOS)).toBe("push")
    expect((await filas()).map((f) => f.endpoint)).toEqual(["https://push.test/b"])
    expect(correo.aConiEnviados).toEqual([])
  })

  it("resets the failure count and stamps the time of the last good delivery", async () => {
    await suscribir("https://push.test/a")
    await pool.query("update public.suscripciones_push set fallos = 3")
    const { notificador } = armar()
    await notificador.aConi(TEXTO, false, DATOS)
    const [fila] = await filas()
    expect(fila?.fallos).toBe(0)
    expect(Math.abs(Date.now() - (fila?.ultimo_ok_en?.getTime() ?? 0))).toBeLessThan(10_000)
  })

  it("sends WAV's alerts by email only", async () => {
    await suscribir("https://push.test/a")
    const { notificador, correo, envios } = armar()
    await notificador.aWav("Falló grabar-pieza", "detalle técnico")
    expect(envios).toEqual([])
    expect(correo.aWavEnviados).toEqual([{ asunto: "Falló grabar-pieza", detalle: "detalle técnico" }])
  })

  it("sends the daily summary as a push with its own short words, and the full text by email as a fallback", async () => {
    await suscribir("https://push.test/a")
    const { notificador, correo, envios } = armar()
    const resumen = { cuerpoPush: "Tienes 2 cosas nuevas", texto: "Tienes un guion listo.\nTienes un video listo." }
    expect(await notificador.resumenAConi(resumen)).toBe("push")
    expect(envios[0]?.mensaje).toEqual({ titulo: "Estudio de Coni", cuerpo: "Tienes 2 cosas nuevas", url: "/" })
    expect(envios[0]?.urgente).toBe(false)
    await pool.query("delete from public.suscripciones_push")
    expect(await notificador.resumenAConi(resumen)).toBe("correo")
    expect(correo.resumenesEnviados).toEqual([resumen])
  })
})
