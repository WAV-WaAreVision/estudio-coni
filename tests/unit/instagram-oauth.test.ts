// @vitest-environment node
import { HttpResponse, http } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Falla } from "@/lib/dominio/falla"
import {
  aLargaDuracion,
  intercambiarCodigo,
  leerCuenta,
  SCOPES_DE_INSTAGRAM,
  urlDeAutorizacion,
} from "@/lib/proveedores/instagram-oauth"
import { servidor } from "../msw"

const APP = {
  appId: "1234567890",
  appSecret: "secreto-de-la-app",
  redirectUri: "https://estudio.example/api/meta/callback",
}
const OAUTH = "https://api.instagram.com"
const GRAPH = "https://graph.instagram.com"

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined)
})
afterEach(() => vi.restoreAllMocks())

describe("urlDeAutorizacion", () => {
  it("builds the Business Login window with the app, the redirect, the code flow, the scopes and the state", () => {
    const url = new URL(urlDeAutorizacion({ ...APP, estado: "abc123" }))

    expect(`${url.origin}${url.pathname}`).toBe("https://www.instagram.com/oauth/authorize")
    expect(url.searchParams.get("client_id")).toBe(APP.appId)
    expect(url.searchParams.get("redirect_uri")).toBe(APP.redirectUri)
    expect(url.searchParams.get("response_type")).toBe("code")
    expect(url.searchParams.get("scope")).toBe(SCOPES_DE_INSTAGRAM.join(","))
    expect(url.searchParams.get("state")).toBe("abc123")
  })

  it("asks to publish and to read the account, and nothing else", () => {
    expect(SCOPES_DE_INSTAGRAM).toEqual(["instagram_business_basic", "instagram_business_content_publish"])
  })

  it("never puts the app secret in the address", () => {
    expect(urlDeAutorizacion({ ...APP, estado: "x" })).not.toContain(APP.appSecret)
  })
})

describe("intercambiarCodigo", () => {
  it("posts the code with the app and the same redirect, as a form, and returns the short-lived token", async () => {
    let cuerpo = ""
    let tipo = ""
    servidor.use(
      http.post(`${OAUTH}/oauth/access_token`, async ({ request }) => {
        cuerpo = await request.text()
        tipo = request.headers.get("content-type") ?? ""
        return HttpResponse.json({ access_token: "IGQ_corto", user_id: 17841400000000000, permissions: [] })
      }),
    )

    const token = await intercambiarCodigo({ ...APP, codigo: "el-codigo" })

    expect(token).toBe("IGQ_corto")
    expect(tipo).toContain("application/x-www-form-urlencoded")
    const campos = new URLSearchParams(cuerpo)
    expect(Object.fromEntries(campos)).toEqual({
      client_id: APP.appId,
      client_secret: APP.appSecret,
      grant_type: "authorization_code",
      redirect_uri: APP.redirectUri,
      code: "el-codigo",
    })
  })

  it("strips the #_ Instagram appends to the code", async () => {
    let codigo = ""
    servidor.use(
      http.post(`${OAUTH}/oauth/access_token`, async ({ request }) => {
        codigo = new URLSearchParams(await request.text()).get("code") ?? ""
        return HttpResponse.json({ access_token: "IGQ_corto", user_id: 1 })
      }),
    )

    await intercambiarCodigo({ ...APP, codigo: "el-codigo#_" })

    expect(codigo).toBe("el-codigo")
  })

  it("explains to Coni that the connection was refused, without the secret or the code", async () => {
    servidor.use(
      http.post(`${OAUTH}/oauth/access_token`, () =>
        HttpResponse.json(
          { error_type: "OAuthException", code: 400, error_message: "Invalid authorization code el-codigo" },
          { status: 400 },
        ),
      ),
    )

    const error = await intercambiarCodigo({ ...APP, codigo: "el-codigo" }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(Falla)
    expect((error as Error).message).toBe("Instagram no aceptó la conexión. Vuelve a conectarla desde Ajustes.")
    expect(JSON.stringify(error)).not.toContain(APP.appSecret)
  })

  it("treats a server error as something to try again, not as a refusal", async () => {
    servidor.use(http.post(`${OAUTH}/oauth/access_token`, () => new HttpResponse("caído", { status: 503 })))

    const error = await intercambiarCodigo({ ...APP, codigo: "x" }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(Falla)
  })

  it("rejects an answer without a token", async () => {
    servidor.use(http.post(`${OAUTH}/oauth/access_token`, () => HttpResponse.json({ user_id: 1 })))

    await expect(intercambiarCodigo({ ...APP, codigo: "x" })).rejects.toThrow(/inesperada/)
  })
})

describe("aLargaDuracion", () => {
  it("exchanges the short-lived token for the 60 days one with the app secret", async () => {
    let consulta = new URLSearchParams()
    servidor.use(
      http.get(`${GRAPH}/access_token`, ({ request }) => {
        consulta = new URL(request.url).searchParams
        return HttpResponse.json({ access_token: "IGQ_largo", token_type: "bearer", expires_in: 5183944 })
      }),
    )

    const resultado = await aLargaDuracion({ appSecret: APP.appSecret, token: "IGQ_corto" })

    expect(resultado).toEqual({ token: "IGQ_largo", expiraEnSegundos: 5183944 })
    expect(Object.fromEntries(consulta)).toEqual({
      grant_type: "ig_exchange_token",
      client_secret: APP.appSecret,
      access_token: "IGQ_corto",
    })
  })

  it("does not leak the tokens when Instagram refuses", async () => {
    servidor.use(
      http.get(`${GRAPH}/access_token`, () =>
        HttpResponse.json({ error: { message: "Invalid token IGQ_corto", code: 190 } }, { status: 400 }),
      ),
    )

    const error = await aLargaDuracion({ appSecret: APP.appSecret, token: "IGQ_corto" }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(Falla)
    expect(String((error as Error).message)).not.toContain("IGQ_corto")
  })
})

describe("leerCuenta", () => {
  it("reads the professional account id (user_id) and the username with the token", async () => {
    let consulta = new URLSearchParams()
    servidor.use(
      http.get(`${GRAPH}/v25.0/me`, ({ request }) => {
        consulta = new URL(request.url).searchParams
        return HttpResponse.json({ user_id: "17841400000000000", username: "coni.delrosario", id: "9988" })
      }),
    )

    const cuenta = await leerCuenta({ token: "IGQ_largo" })

    expect(cuenta).toEqual({ cuentaId: "17841400000000000", usuario: "coni.delrosario" })
    expect(consulta.get("fields")).toBe("user_id,username")
    expect(consulta.get("access_token")).toBe("IGQ_largo")
  })

  it("accepts the id as a number, the way the token exchange returns it", async () => {
    servidor.use(
      http.get(`${GRAPH}/v25.0/me`, () => HttpResponse.json({ user_id: 17841400000000000, username: "coni" })),
    )

    expect((await leerCuenta({ token: "t" })).cuentaId).toBe("17841400000000000")
  })

  it("keeps every digit of an id that is too big for a JSON number", async () => {
    servidor.use(
      http.get(
        `${GRAPH}/v25.0/me`,
        () =>
          new HttpResponse('{"user_id":17841405793187218,"username":"coni"}', {
            headers: { "content-type": "application/json" },
          }),
      ),
    )

    expect((await leerCuenta({ token: "t" })).cuentaId).toBe("17841405793187218")
  })

  it("fails when the account has no professional id", async () => {
    servidor.use(http.get(`${GRAPH}/v25.0/me`, () => HttpResponse.json({ username: "coni" })))

    await expect(leerCuenta({ token: "t" })).rejects.toThrow(/inesperada/)
  })
})
