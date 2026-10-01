// @vitest-environment node
import { HttpResponse, http } from "msw"
import { describe, expect, it } from "vitest"
import { verificarVoz } from "@/lib/proveedores/elevenlabs"
import { verificarAnthropic, verificarHeygen } from "@/lib/proveedores/verificaciones"
import { servidor } from "../msw"

const CLAVE = "clave-de-prueba-de-coni"

describe("verificarHeygen", () => {
  it("asks for the account with the key in X-Api-Key and says the key works", async () => {
    let cabecera: string | null = null
    servidor.use(
      http.get("https://api.heygen.com/v3/users/me", ({ request }) => {
        cabecera = request.headers.get("x-api-key")
        return HttpResponse.json({ data: { username: "coni" } })
      }),
    )

    expect(await verificarHeygen({ clave: CLAVE })).toEqual({ ok: true })
    expect(cabecera).toBe(CLAVE)
  })

  it("says the key was rejected on 401 and 403", async () => {
    for (const estado of [401, 403]) {
      servidor.use(
        http.get("https://api.heygen.com/v3/users/me", () => new HttpResponse("unauthorized", { status: estado })),
      )
      expect(await verificarHeygen({ clave: CLAVE })).toMatchObject({ ok: false, rechazada: true })
    }
  })

  it("says it could not check, and not that the key is wrong, when HeyGen fails or is unreachable", async () => {
    servidor.use(http.get("https://api.heygen.com/v3/users/me", () => new HttpResponse("caído", { status: 503 })))
    expect(await verificarHeygen({ clave: CLAVE })).toMatchObject({ ok: false, rechazada: false })

    servidor.use(http.get("https://api.heygen.com/v3/users/me", () => HttpResponse.error()))
    expect(await verificarHeygen({ clave: CLAVE })).toMatchObject({ ok: false, rechazada: false })
  })

  it("never puts the key in the detail", async () => {
    servidor.use(
      http.get("https://api.heygen.com/v3/users/me", () => new HttpResponse(`bad key ${CLAVE}`, { status: 401 })),
    )

    const resultado = await verificarHeygen({ clave: CLAVE })

    expect(JSON.stringify(resultado)).not.toContain(CLAVE)
  })
})

describe("verificarAnthropic", () => {
  const URL_MODELOS = "https://api.anthropic.com/v1/models"

  it("lists one model, which costs nothing, and says the key works", async () => {
    let clave: string | null = null
    let consulta = ""
    servidor.use(
      http.get(URL_MODELOS, ({ request }) => {
        clave = request.headers.get("x-api-key")
        consulta = new URL(request.url).search
        return HttpResponse.json({ data: [{ id: "claude-opus-5-5", type: "model" }], has_more: false })
      }),
    )

    expect(await verificarAnthropic({ clave: CLAVE })).toEqual({ ok: true })
    expect(clave).toBe(CLAVE)
    expect(consulta).toContain("limit=1")
  })

  it("says the key was rejected on 401 and 403", async () => {
    for (const estado of [401, 403]) {
      servidor.use(
        http.get(URL_MODELOS, () =>
          HttpResponse.json(
            { type: "error", error: { type: "authentication_error", message: "x" } },
            { status: estado },
          ),
        ),
      )
      expect(await verificarAnthropic({ clave: CLAVE })).toMatchObject({ ok: false, rechazada: true })
    }
  })

  it("says it could not check when Anthropic fails", async () => {
    servidor.use(
      http.get(URL_MODELOS, () => HttpResponse.json({ type: "error", error: { type: "api_error" } }, { status: 500 })),
    )

    expect(await verificarAnthropic({ clave: CLAVE })).toMatchObject({ ok: false, rechazada: false })
  })
})

describe("verificarVoz: why it failed", () => {
  it("carries the HTTP status of a rejection so the caller can tell a bad key from a bad voice", async () => {
    servidor.use(
      http.get("https://api.elevenlabs.io/v1/voices/v1", () =>
        HttpResponse.json({ detail: { message: "Invalid API key" } }, { status: 401 }),
      ),
    )

    expect(await verificarVoz({ clave: CLAVE, voiceId: "v1" })).toMatchObject({ ok: false, http: 401 })
  })

  it("carries no status when ElevenLabs could not be reached", async () => {
    servidor.use(http.get("https://api.elevenlabs.io/v1/voices/v1", () => HttpResponse.error()))

    const resultado = await verificarVoz({ clave: CLAVE, voiceId: "v1" })

    expect(resultado.ok).toBe(false)
    expect(resultado.ok === false && resultado.http).toBeUndefined()
  })
})
