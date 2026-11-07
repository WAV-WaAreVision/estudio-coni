// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"

const leerSesion = vi.hoisted(() => vi.fn())
vi.mock("@/lib/sesion/coni", () => ({ leerSesion }))

afterEach(() => {
  leerSesion.mockReset()
})

// Old links, the iPhone home-screen icon and the history still open /ir-a-biblioteca (batch 7).
describe("/ir-a-biblioteca", () => {
  it("sends someone without a session to sign in", async () => {
    leerSesion.mockResolvedValue({ estado: "sin_sesion" })
    const { GET } = await import("@/app/ir-a-biblioteca/route")

    const respuesta = await GET()

    expect(respuesta.status).toBe(307)
    expect(respuesta.headers.get("location")).toBe("/ingreso")
  })

  it("sends anyone who is not Coni, the maintainer included, back to the app", async () => {
    leerSesion.mockResolvedValue({ estado: "otra_persona" })
    const { GET } = await import("@/app/ir-a-biblioteca/route")

    const respuesta = await GET()

    expect(respuesta.status).toBe(307)
    expect(respuesta.headers.get("location")).toBe("/")
  })

  it("sends Coni to her Biblioteca inside the app, with no page of its own", async () => {
    leerSesion.mockResolvedValue({
      estado: "coni",
      db: {},
      userId: "c0000000-0000-4000-8000-000000000001",
      correo: "coni@estudio.test",
    })
    const { GET } = await import("@/app/ir-a-biblioteca/route")

    const respuesta = await GET()

    expect(respuesta.status).toBe(307)
    expect(respuesta.headers.get("location")).toBe("/biblioteca")
    expect(await respuesta.text()).toBe("")
  })
})
