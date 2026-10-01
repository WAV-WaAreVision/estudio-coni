import { createECDH, randomBytes } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { HttpResponse, http } from "msw"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { generateVAPIDKeys } from "web-push"
import { enviarPrueba, guardarSuscripcion, marcarAvatarVisto, quitarSuscripcion } from "@/lib/acciones/avisos"
import { servicioPushVapid } from "@/lib/proveedores/push"
import type { Database } from "@/lib/supabase/database.types"
import { servidor } from "../msw"
import { pool } from "./db"
import { clienteDeConi, clienteDelMantenedor } from "./sesion-coni"

type Db = SupabaseClient<Database>

let coni: Db
let mantenedor: Db

const vapid = generateVAPIDKeys()
const push = () =>
  servicioPushVapid({
    clavePublica: vapid.publicKey,
    clavePrivada: vapid.privateKey,
    asunto: "mailto:wav@estudio.test",
  })
const deps = (db: Db) => ({ db, push })

function claves() {
  const navegador = createECDH("prime256v1")
  navegador.generateKeys()
  return { p256dh: navegador.getPublicKey().toString("base64url"), auth: randomBytes(16).toString("base64url") }
}

const ENDPOINT = "https://push.example.test/send/uno"

function suscripcion(endpoint = ENDPOINT) {
  return { endpoint, ...claves(), userAgent: "Safari iOS" }
}

async function filas() {
  const { rows } = await pool.query<{ endpoint: string; p256dh: string; user_agent: string | null }>(
    "select endpoint, p256dh, user_agent from public.suscripciones_push order by endpoint",
  )
  return rows
}

beforeAll(async () => {
  coni = await clienteDeConi()
  mantenedor = await clienteDelMantenedor()
})

beforeEach(async () => {
  await pool.query("delete from public.suscripciones_push")
  await pool.query("update public.ajustes set avatar_visto_en = null")
})
afterAll(async () => {
  await pool.query("delete from public.suscripciones_push")
  await pool.end()
})

describe("guardarSuscripcion", () => {
  it("saves the device of Coni with what the browser gave", async () => {
    const entrada = suscripcion()
    expect(await guardarSuscripcion(deps(coni), entrada)).toEqual({ ok: true })
    expect(await filas()).toEqual([{ endpoint: ENDPOINT, p256dh: entrada.p256dh, user_agent: "Safari iOS" }])
  })

  it("replaces the keys when the same device subscribes again, without a duplicate", async () => {
    await guardarSuscripcion(deps(coni), suscripcion())
    const nueva = suscripcion()
    expect(await guardarSuscripcion(deps(coni), nueva)).toEqual({ ok: true })
    expect(await filas()).toEqual([{ endpoint: ENDPOINT, p256dh: nueva.p256dh, user_agent: "Safari iOS" }])
  })

  it("does not save anything for the maintainer", async () => {
    const resultado = await guardarSuscripcion(deps(mantenedor), suscripcion())
    expect(resultado.ok).toBe(false)
    expect(await filas()).toEqual([])
  })
})

describe("quitarSuscripcion", () => {
  it("removes the device it is asked to remove and leaves the others", async () => {
    await guardarSuscripcion(deps(coni), suscripcion())
    await guardarSuscripcion(deps(coni), suscripcion("https://push.example.test/send/dos"))
    expect(await quitarSuscripcion(deps(coni), ENDPOINT)).toEqual({ ok: true })
    expect((await filas()).map((f) => f.endpoint)).toEqual(["https://push.example.test/send/dos"])
  })
})

describe("enviarPrueba", () => {
  function respondiendo(estado: number, endpoint = ENDPOINT) {
    const cuerpos: ArrayBuffer[] = []
    servidor.use(
      http.post(endpoint, async ({ request }) => {
        cuerpos.push(await request.arrayBuffer())
        return new HttpResponse("", { status: estado })
      }),
    )
    return cuerpos
  }

  it("sends a push to each of her devices and says how many took it", async () => {
    await guardarSuscripcion(deps(coni), suscripcion())
    const cuerpos = respondiendo(201)
    expect(await enviarPrueba(deps(coni))).toEqual({ ok: true, enviados: 1 })
    expect(cuerpos).toHaveLength(1)
  })

  it("asks her to turn notices on when there is no device yet", async () => {
    const resultado = await enviarPrueba(deps(coni))
    expect(resultado).toEqual({ ok: false, error: "Primero activa los avisos en este celular." })
  })

  it("removes a device the push service forgot and tells her to turn them on again", async () => {
    await guardarSuscripcion(deps(coni), suscripcion())
    respondiendo(410)
    const resultado = await enviarPrueba(deps(coni))
    expect(resultado).toEqual({ ok: false, error: "Este celular ya no recibe avisos. Actívalos de nuevo." })
    expect(await filas()).toEqual([])
  })

  it("says it could not send when the push service fails, and keeps the device", async () => {
    await guardarSuscripcion(deps(coni), suscripcion())
    respondiendo(503)
    const resultado = await enviarPrueba(deps(coni))
    expect(resultado).toEqual({ ok: false, error: "No pude mandarlo ahora. Inténtalo en unos minutos." })
    expect(await filas()).toHaveLength(1)
  })

  it("says the notices are not ready yet when the server has no push keys", async () => {
    await guardarSuscripcion(deps(coni), suscripcion())
    const resultado = await enviarPrueba({
      db: coni,
      push: () => {
        throw new Error("Falta la variable de entorno VAPID_PUBLIC_KEY.")
      },
    })
    expect(resultado.ok).toBe(false)
  })
})

describe("marcarAvatarVisto", () => {
  async function visto() {
    const { rows } = await pool.query<{ avatar_visto_en: Date | null }>("select avatar_visto_en from public.ajustes")
    return rows[0]?.avatar_visto_en ?? null
  }

  it("remembers the first time, in the database", async () => {
    expect(await marcarAvatarVisto(coni)).toEqual({ ok: true })
    expect(Math.abs(Date.now() - ((await visto())?.getTime() ?? 0))).toBeLessThan(10_000)
  })

  it("keeps the first moment when asked again", async () => {
    await marcarAvatarVisto(coni)
    const primera = await visto()
    await new Promise((resolver) => setTimeout(resolver, 20))
    await marcarAvatarVisto(coni)
    expect(await visto()).toEqual(primera)
  })

  it("is not the maintainer's to mark: it is her message", async () => {
    await marcarAvatarVisto(mantenedor)
    expect(await visto()).toBeNull()
  })
})
