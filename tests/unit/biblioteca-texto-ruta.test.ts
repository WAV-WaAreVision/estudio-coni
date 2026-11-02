// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

const { conSesionDeConi } = vi.hoisted(() => ({
  conSesionDeConi: vi.fn(
    async (..._: unknown[]): Promise<{ ok: true; url: string } | { ok: false; error: string }> => ({
      ok: true,
      url: "https://r2.test/firmada",
    }),
  ),
}))
vi.mock("@/lib/acciones/servidor", () => ({ conSesionDeConi }))

import { GET } from "@/app/(app)/biblioteca/materiales/[id]/texto/route"
import { ERROR_GENERICO, ERROR_SESION_VENCIDA } from "@/lib/acciones/resultado"

const ID = "11111111-2222-4333-8444-555555555555"
const llamar = () =>
  GET(new Request(`http://app.test/biblioteca/materiales/${ID}/texto`), { params: Promise.resolve({ id: ID }) })

beforeEach(() => vi.clearAllMocks())

describe("GET /biblioteca/materiales/[id]/texto", () => {
  it("checks Coni with the id and sends the browser to the signed text, never cached", async () => {
    const respuesta = await llamar()
    expect(conSesionDeConi).toHaveBeenCalledWith(
      "pedirTextoOriginal",
      expect.anything(),
      { materialId: ID },
      expect.any(Function),
    )
    expect(respuesta.status).toBe(302)
    expect(respuesta.headers.get("location")).toBe("https://r2.test/firmada")
    expect(respuesta.headers.get("cache-control")).toBe("no-store")
  })

  it.each([
    ["Ese texto todavía no está disponible.", 404],
    ["No encontré ese material.", 404],
    [ERROR_SESION_VENCIDA, 401],
    ["Esta app es solo para Coni.", 403],
    [ERROR_GENERICO, 502],
  ])("answers %j in plain text with status %i, never cached", async (error, estado) => {
    conSesionDeConi.mockResolvedValueOnce({ ok: false, error })
    const respuesta = await llamar()
    expect(respuesta.status).toBe(estado)
    expect(await respuesta.text()).toBe(error)
    expect(respuesta.headers.get("cache-control")).toBe("no-store")
  })

  it("answers 404 for an id that is not a uuid, without opening a session", async () => {
    const respuesta = await GET(new Request("http://app.test/biblioteca/materiales/abc/texto"), {
      params: Promise.resolve({ id: "abc" }),
    })
    expect(respuesta.status).toBe(404)
    expect(await respuesta.text()).toBe("No encontré ese material.")
    expect(respuesta.headers.get("cache-control")).toBe("no-store")
    expect(conSesionDeConi).not.toHaveBeenCalled()
  })
})
