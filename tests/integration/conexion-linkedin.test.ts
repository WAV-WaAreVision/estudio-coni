import { HttpResponse } from "msw"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { desconectarLinkedin, leerAppDeLinkedin, terminarConexionLinkedin } from "@/lib/acciones/linkedin"
import { simularLinkedin } from "../linkedin-msw"
import { pool } from "./db"
import { clienteDeConi } from "./sesion-coni"

const APP = {
  clientId: "77abc",
  clientSecret: "secreto-de-prueba",
  redirectUri: "https://estudio.example/api/linkedin/callback",
}
const AHORA = "2031-01-01T12:00:00.000Z"
const ESTADO = "e".repeat(64)

let coni: Awaited<ReturnType<typeof clienteDeConi>>
beforeAll(async () => {
  coni = await clienteDeConi()
})
afterEach(async () => {
  vi.restoreAllMocks()
  await pool.query("delete from vault.secrets where name = 'linkedin'")
  await pool.query(
    "update public.ajustes set linkedin_miembro = null, linkedin_nombre = null, linkedin_token_expira_en = null, linkedin_conectado_en = null",
  )
})
afterAll(() => pool.end())

const deps = () => ({ db: coni, app: APP, ahora: () => AHORA })
const llegada = { codigo: "codigo-1", estado: ESTADO, estadoGuardado: ESTADO, errorDeLinkedin: null }

describe("leerAppDeLinkedin", () => {
  it("is null until the three variables are set", () => {
    expect(leerAppDeLinkedin({ LINKEDIN_CLIENT_ID: "a", LINKEDIN_CLIENT_SECRET: "b" })).toBeNull()
    expect(
      leerAppDeLinkedin({ LINKEDIN_CLIENT_ID: "a", LINKEDIN_CLIENT_SECRET: "b", LINKEDIN_REDIRECT_URI: "c" }),
    ).toEqual({ clientId: "a", clientSecret: "b", redirectUri: "c" })
  })
})

describe("terminarConexionLinkedin", () => {
  it("saves token, member, name and 60-day expiry when everything checks", async () => {
    simularLinkedin()
    expect(await terminarConexionLinkedin(deps(), llegada)).toEqual({ ok: true, nombre: "Coni del Rosario" })
    const { rows } = await pool.query("select linkedin_miembro, linkedin_token_expira_en from public.ajustes")
    expect(rows[0].linkedin_miembro).toBe("urn:li:person:abc123XYZ")
    expect(new Date(rows[0].linkedin_token_expira_en).toISOString()).toBe("2031-03-02T12:00:00.000Z")
  })

  it.each([
    [{ ...llegada, estadoGuardado: "f".repeat(64) }, "estado"],
    [{ ...llegada, errorDeLinkedin: "user_cancelled_authorize" }, "cancelada"],
    [{ ...llegada, codigo: undefined }, "fallo"],
  ])("handles a bad arrival without calling LinkedIn: %o -> %s", async (mala, motivo) => {
    const sim = simularLinkedin()
    expect(await terminarConexionLinkedin(deps(), mala)).toEqual({ ok: false, motivo })
    expect(sim.tokens).toHaveLength(0)
  })

  it("says sin_app without the variables", async () => {
    expect(await terminarConexionLinkedin({ ...deps(), app: null }, llegada)).toEqual({ ok: false, motivo: "sin_app" })
  })

  it("refuses a connection without w_member_social and saves nothing", async () => {
    simularLinkedin({
      token: () => HttpResponse.json({ access_token: "t", expires_in: 5_184_000, scope: "openid,profile" }),
    })
    expect(await terminarConexionLinkedin(deps(), llegada)).toEqual({ ok: false, motivo: "permisos" })
    expect((await pool.query("select count(*)::int as n from vault.secrets where name = 'linkedin'")).rows[0].n).toBe(0)
  })

  it("says rechazada when LinkedIn refuses the code, fallo on a 5xx", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    simularLinkedin({ token: () => HttpResponse.json({ error: "invalid_grant" }, { status: 400 }) })
    expect(await terminarConexionLinkedin(deps(), llegada)).toEqual({ ok: false, motivo: "rechazada" })
    simularLinkedin({ userinfo: () => new HttpResponse(null, { status: 502 }) })
    expect(await terminarConexionLinkedin(deps(), llegada)).toEqual({ ok: false, motivo: "fallo" })
  })
})

describe("desconectarLinkedin", () => {
  it("forgets the token and the member", async () => {
    simularLinkedin()
    await terminarConexionLinkedin(deps(), llegada)
    await desconectarLinkedin(coni)
    const { rows } = await pool.query("select linkedin_miembro from public.ajustes")
    expect(rows[0].linkedin_miembro).toBeNull()
  })
})
