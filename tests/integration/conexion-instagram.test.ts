import { HttpResponse, http } from "msw"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { terminarConexion } from "@/lib/acciones/instagram"
import { servidor } from "../msw"
import { pool } from "./db"
import { clienteDeConi, clienteDelMantenedor } from "./sesion-coni"

const APP = {
  appId: "1234567890",
  appSecret: "secreto-de-la-app",
  redirectUri: "https://estudio.example/api/meta/callback",
}
const OAUTH = "https://api.instagram.com"
const GRAPH = "https://graph.instagram.com"
const AHORA = "2026-10-01T15:00:00.000Z"
const ESTADO = "e".repeat(64)

let coni: Awaited<ReturnType<typeof clienteDeConi>>
let mantenedor: Awaited<ReturnType<typeof clienteDelMantenedor>>

beforeAll(async () => {
  coni = await clienteDeConi()
  mantenedor = await clienteDelMantenedor()
})

afterEach(async () => {
  vi.restoreAllMocks()
  await pool.query("delete from vault.secrets where name = 'meta'")
  await pool.query("update public.ajustes set meta_cuenta_id = null, meta_token_expira_en = null")
})

afterAll(() => pool.end())

function instagramResponde(opciones: { codigo?: () => Response; cuenta?: () => Response } = {}) {
  const llamadas: string[] = []
  servidor.use(
    http.post(`${OAUTH}/oauth/access_token`, () => {
      llamadas.push("codigo")
      return opciones.codigo?.() ?? HttpResponse.json({ access_token: "IGQ_corto", user_id: 17841400000000000 })
    }),
    http.get(`${GRAPH}/access_token`, () => {
      llamadas.push("larga")
      return HttpResponse.json({ access_token: "IGQ_largo", token_type: "bearer", expires_in: 5183944 })
    }),
    http.get(`${GRAPH}/v25.0/me`, () => {
      llamadas.push("cuenta")
      return opciones.cuenta?.() ?? HttpResponse.json({ user_id: "17841405793187218", username: "coni.delrosario" })
    }),
  )
  return llamadas
}

function conexion(parcial: Partial<Parameters<typeof terminarConexion>[1]> = {}, db = coni) {
  return terminarConexion(
    { db, app: APP, ahora: () => AHORA },
    { codigo: "el-codigo#_", estado: ESTADO, estadoGuardado: ESTADO, ...parcial },
  )
}

async function guardado() {
  const secreto = await pool.query("select decrypted_secret from vault.decrypted_secrets where name = 'meta'")
  const ajustes = await pool.query("select meta_cuenta_id, meta_token_expira_en from public.ajustes")
  return { token: secreto.rows[0]?.decrypted_secret as string | undefined, ...ajustes.rows[0] }
}

describe("terminarConexion", () => {
  it("saves the long-lived token, the account and the expiry 60 days away", async () => {
    const llamadas = instagramResponde()

    const resultado = await conexion()

    expect(resultado).toEqual({ ok: true, usuario: "coni.delrosario" })
    expect(llamadas).toEqual(["codigo", "larga", "cuenta"])
    const fila = await guardado()
    expect(fila.token).toBe("IGQ_largo")
    expect(fila.meta_cuenta_id).toBe("17841405793187218")
    expect(new Date(fila.meta_token_expira_en).toISOString()).toBe(
      new Date(Date.parse(AHORA) + 5183944 * 1000).toISOString(),
    )
  })

  it("stops without calling Instagram when the state is not the one she started with", async () => {
    const llamadas = instagramResponde()

    const resultado = await conexion({ estado: "otro".repeat(22) })

    expect(resultado).toEqual({ ok: false, motivo: "estado" })
    expect(llamadas).toEqual([])
    expect((await guardado()).token).toBeUndefined()
  })

  it("stops when there is no saved state at all (a link opened out of nowhere)", async () => {
    const llamadas = instagramResponde()

    expect(await conexion({ estadoGuardado: undefined })).toEqual({ ok: false, motivo: "estado" })
    expect(llamadas).toEqual([])
  })

  it("says she cancelled when Instagram sends access_denied", async () => {
    const llamadas = instagramResponde()

    const resultado = await conexion({ codigo: undefined, errorDeInstagram: "access_denied" })

    expect(resultado).toEqual({ ok: false, motivo: "cancelada" })
    expect(llamadas).toEqual([])
  })

  it("says Instagram refused the code and saves nothing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    instagramResponde({ codigo: () => HttpResponse.json({ error_message: "Invalid code" }, { status: 400 }) })

    const resultado = await conexion()

    expect(resultado).toEqual({ ok: false, motivo: "rechazada" })
    expect((await guardado()).token).toBeUndefined()
  })

  it("asks her to try again when Instagram is down, and saves nothing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    instagramResponde({ cuenta: () => new HttpResponse("caído", { status: 503 }) })

    const resultado = await conexion()

    expect(resultado).toEqual({ ok: false, motivo: "fallo" })
    const fila = await guardado()
    expect(fila.token).toBeUndefined()
    expect(fila.meta_cuenta_id).toBeNull()
  })

  it("does not save when the database refuses, as with anybody who is not Coni", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    instagramResponde()

    const resultado = await conexion({}, mantenedor)

    expect(resultado).toEqual({ ok: false, motivo: "fallo" })
    expect((await guardado()).token).toBeUndefined()
  })

  it("says the app is not configured when Meta's app is missing, without asking anything", async () => {
    const llamadas = instagramResponde()

    const resultado = await terminarConexion(
      { db: coni, app: null, ahora: () => AHORA },
      { codigo: "x", estado: ESTADO, estadoGuardado: ESTADO },
    )

    expect(resultado).toEqual({ ok: false, motivo: "sin_app" })
    expect(llamadas).toEqual([])
  })
})
