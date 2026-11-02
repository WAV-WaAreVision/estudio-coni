// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"

const leerSesion = vi.hoisted(() => vi.fn())
const generateLink = vi.hoisted(() => vi.fn())
vi.mock("@/lib/sesion/coni", () => ({ leerSesion }))
vi.mock("@/lib/acciones/servidor", () => ({ clienteDeServicio: () => ({ auth: { admin: { generateLink } } }) }))

const TOKEN = "0123456789abcdef0123456789abcdef0123456789abcdef01234567"
const CONI = { estado: "coni", db: {}, userId: "c0000000-0000-4000-8000-000000000001", correo: "coni@estudio.test" }

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  leerSesion.mockReset()
  generateLink.mockReset()
})

describe("/ir-a-biblioteca", () => {
  it("sends someone without a session to sign in, without minting anything", async () => {
    leerSesion.mockResolvedValue({ estado: "sin_sesion" })
    const { GET } = await import("@/app/ir-a-biblioteca/route")

    const respuesta = await GET()

    expect(respuesta.headers.get("location")).toBe("/ingreso")
    expect(generateLink).not.toHaveBeenCalled()
  })

  it("refuses anyone who is not Coni, the maintainer included: back to the app, no link", async () => {
    leerSesion.mockResolvedValue({ estado: "otra_persona" })
    const { GET } = await import("@/app/ir-a-biblioteca/route")

    const respuesta = await GET()

    expect(respuesta.headers.get("location")).toBe("/")
    expect(generateLink).not.toHaveBeenCalled()
  })

  it("answers Coni the page that posts her token to Ingesta, never cached and never referred", async () => {
    vi.stubEnv("INGESTA_URL", "https://ingesta.example")
    leerSesion.mockResolvedValue(CONI)
    generateLink.mockResolvedValue({ data: { properties: { hashed_token: TOKEN } }, error: null })
    const { GET } = await import("@/app/ir-a-biblioteca/route")

    const respuesta = await GET()

    expect(respuesta.status).toBe(200)
    expect(respuesta.headers.get("content-type")).toBe("text/html; charset=utf-8")
    expect(respuesta.headers.get("cache-control")).toBe("no-store")
    expect(respuesta.headers.get("referrer-policy")).toBe("strict-origin")
    expect(respuesta.headers.get("location")).toBeNull()
    expect(generateLink).toHaveBeenCalledWith({ type: "magiclink", email: "coni@estudio.test" })
    const html = await respuesta.text()
    expect(html).toContain('action="https://ingesta.example/ingreso/puente"')
    expect(html).toContain(`value="${TOKEN}"`)
  })

  it("sends Coni to the plain failure page when INGESTA_URL is missing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    leerSesion.mockResolvedValue(CONI)
    const { GET } = await import("@/app/ir-a-biblioteca/route")

    const respuesta = await GET()

    expect(respuesta.headers.get("location")).toBe("/biblioteca-no-abrio")
    expect(generateLink).not.toHaveBeenCalled()
  })

  it("sends Coni to the failure page when the link cannot be made", async () => {
    vi.stubEnv("INGESTA_URL", "https://ingesta.example")
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    leerSesion.mockResolvedValue(CONI)
    generateLink.mockResolvedValue({ data: { properties: null }, error: { message: "boom", status: 500 } })
    const { GET } = await import("@/app/ir-a-biblioteca/route")

    expect((await GET()).headers.get("location")).toBe("/biblioteca-no-abrio")
  })
})
