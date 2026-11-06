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
const { urlDeTexto } = vi.hoisted(() => ({
  urlDeTexto: vi.fn(async (..._: unknown[]): Promise<string | null> => "https://r2.test/firmada-por-el-almacen"),
}))
vi.mock("@/lib/proveedores/almacen", () => ({ almacenReal: () => ({ urlDeTexto }) }))

import { GET } from "@/app/(app)/biblioteca/materiales/[id]/texto/route"
import { SobreMaterial } from "@/lib/acciones/biblioteca"
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
      SobreMaterial,
      { materialId: ID },
      expect.any(Function),
    )
    expect(respuesta.status).toBe(302)
    expect(respuesta.headers.get("location")).toBe("https://r2.test/firmada")
    expect(respuesta.headers.get("cache-control")).toBe("no-store")
  })

  it("wires the session's client and the real store into pedirTextoOriginal for five minutes", async () => {
    await llamar()
    const trabajo = conSesionDeConi.mock.calls[0]?.[3] as (db: unknown, datos: unknown) => Promise<unknown>
    const db = {
      rpc: async () => ({ data: true, error: null }),
      from: () => ({
        select: () => ({
          eq: () => ({ is: () => ({ maybeSingle: async () => ({ data: { id: ID }, error: null }) }) }),
        }),
      }),
    }
    expect(await trabajo(db, { materialId: ID })).toEqual({ ok: true, url: "https://r2.test/firmada-por-el-almacen" })
    expect(urlDeTexto).toHaveBeenCalledWith(ID, 300)
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
