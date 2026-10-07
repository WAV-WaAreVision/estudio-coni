// @vitest-environment node
import { HttpResponse } from "msw"
import { describe, expect, it } from "vitest"
import { estadoCoincide, nuevoEstado } from "@/lib/acciones/estado-oauth"
import { Falla } from "@/lib/dominio/falla"
import {
  intercambiarCodigoLinkedin,
  leerMiembro,
  SCOPES_DE_LINKEDIN,
  urlDeAutorizacionLinkedin,
} from "@/lib/proveedores/linkedin-oauth"
import { simularLinkedin } from "../linkedin-msw"

const APP = {
  clientId: "77abc",
  clientSecret: "secreto-de-prueba",
  redirectUri: "https://estudio.example/api/linkedin/callback",
}

describe("urlDeAutorizacionLinkedin", () => {
  it("asks only for openid, profile and w_member_social, space separated, with the state", () => {
    const url = new URL(
      urlDeAutorizacionLinkedin({ clientId: APP.clientId, redirectUri: APP.redirectUri, estado: "e1" }),
    )
    expect(url.origin + url.pathname).toBe("https://www.linkedin.com/oauth/v2/authorization")
    expect(url.searchParams.get("response_type")).toBe("code")
    expect(url.searchParams.get("client_id")).toBe("77abc")
    expect(url.searchParams.get("redirect_uri")).toBe(APP.redirectUri)
    expect(url.searchParams.get("state")).toBe("e1")
    expect(url.searchParams.get("scope")).toBe("openid profile w_member_social")
    expect(url.toString()).toContain("scope=openid%20profile%20w_member_social")
    expect(SCOPES_DE_LINKEDIN).not.toContain("email")
  })
})

describe("intercambiarCodigoLinkedin", () => {
  it("trades the code with a form post and returns token, seconds and granted scopes", async () => {
    const sim = simularLinkedin()
    const resultado = await intercambiarCodigoLinkedin({ ...APP, codigo: "codigo-1" })
    expect(resultado).toEqual({
      token: "AQV_token_de_prueba",
      expiraEnSegundos: 5_184_000,
      scopes: ["openid", "profile", "w_member_social"],
    })
    expect(Object.fromEntries(sim.tokens[0] ?? [])).toEqual({
      grant_type: "authorization_code",
      code: "codigo-1",
      client_id: "77abc",
      client_secret: "secreto-de-prueba",
      redirect_uri: APP.redirectUri,
    })
  })

  it("turns a 4xx into a Falla for Coni, without the secret in the message", async () => {
    simularLinkedin({
      token: () => HttpResponse.json({ error: "invalid_request", secreto: "secreto-de-prueba" }, { status: 400 }),
    })
    const error = await intercambiarCodigoLinkedin({ ...APP, codigo: "x" }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Falla)
    expect(String((error as Error).message)).not.toContain("secreto-de-prueba")
  })

  it("keeps a 5xx as a plain error", async () => {
    simularLinkedin({ token: () => new HttpResponse(null, { status: 503 }) })
    const error = await intercambiarCodigoLinkedin({ ...APP, codigo: "x" }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(Falla)
  })
})

describe("leerMiembro", () => {
  it("builds the person URN from sub and keeps the name, with the bearer token", async () => {
    const sim = simularLinkedin()
    expect(await leerMiembro({ token: "AQV_token_de_prueba" })).toEqual({
      miembro: "urn:li:person:abc123XYZ",
      nombre: "Coni del Rosario",
    })
    expect(sim.cabeceras[0]?.autorizacion).toBe("Bearer AQV_token_de_prueba")
  })

  it("refuses a sub that cannot be part of a URN", async () => {
    simularLinkedin({ userinfo: () => HttpResponse.json({ sub: "a b:c" }) })
    await expect(leerMiembro({ token: "t" })).rejects.toThrow(/inesperada/)
  })
})

describe("estado-oauth", () => {
  it("makes 64 hex characters and compares in constant time", () => {
    const estado = nuevoEstado()
    expect(estado).toMatch(/^[0-9a-f]{64}$/)
    expect(estadoCoincide(estado, estado)).toBe(true)
    expect(estadoCoincide(estado, `${estado.slice(0, 63)}0`)).toBe(estado.endsWith("0"))
    expect(estadoCoincide(undefined, estado)).toBe(false)
  })
})
