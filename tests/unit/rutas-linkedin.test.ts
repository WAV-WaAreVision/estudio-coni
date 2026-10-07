// @vitest-environment node
import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/sesion/coni", () => ({ leerSesion: vi.fn(async () => ({ estado: "coni", db: {} })) }))
const terminar = vi.fn()
vi.mock("@/lib/acciones/linkedin", async (original) => ({
  ...(await original<typeof import("@/lib/acciones/linkedin")>()),
  terminarConexionLinkedin: (...args: unknown[]) => terminar(...args),
}))

afterEach(() => {
  vi.unstubAllEnvs()
  terminar.mockReset()
})

describe("/api/linkedin/conectar", () => {
  it("sends Coni to LinkedIn with a state cookie only the callback path can read", async () => {
    vi.stubEnv("LINKEDIN_CLIENT_ID", "77abc")
    vi.stubEnv("LINKEDIN_CLIENT_SECRET", "s")
    vi.stubEnv("LINKEDIN_REDIRECT_URI", "https://estudio.example/api/linkedin/callback")
    const { GET } = await import("@/app/api/linkedin/conectar/route")
    const respuesta = await GET(new NextRequest("https://estudio.example/api/linkedin/conectar"))
    const destino = new URL(respuesta.headers.get("location") ?? "")
    expect(destino.host).toBe("www.linkedin.com")
    const cookie = respuesta.cookies.get("estudio_linkedin_estado")
    expect(cookie?.value).toBe(destino.searchParams.get("state"))
    expect(cookie).toMatchObject({ httpOnly: true, path: "/api/linkedin", sameSite: "lax", secure: true })
  })

  it("goes back to Cuentas with sin_app when the app is not configured", async () => {
    const { GET } = await import("@/app/api/linkedin/conectar/route")
    const respuesta = await GET(new NextRequest("https://estudio.example/api/linkedin/conectar"))
    expect(respuesta.headers.get("location")).toContain("/ajustes/cuentas?linkedin=sin_app")
  })
})

describe("/api/linkedin/callback", () => {
  it("passes code, state, cookie and error to the action, clears the cookie and returns a fixed word", async () => {
    terminar.mockResolvedValue({ ok: true, nombre: "Coni" })
    const { GET } = await import("@/app/api/linkedin/callback/route")
    const pedido = new NextRequest("https://estudio.example/api/linkedin/callback?code=c1&state=s1")
    pedido.cookies.set("estudio_linkedin_estado", "s1")
    const respuesta = await GET(pedido)
    expect(terminar.mock.calls[0]?.[1]).toEqual({
      codigo: "c1",
      estado: "s1",
      estadoGuardado: "s1",
      errorDeLinkedin: null,
    })
    expect(respuesta.headers.get("location")).toContain("/ajustes/cuentas?linkedin=conectada")
    expect(respuesta.cookies.get("estudio_linkedin_estado")?.value).toBe("")
  })
})
