// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

const { conSesionDeConi } = vi.hoisted(() => ({
  conSesionDeConi: vi.fn(
    async (..._: unknown[]): Promise<{ ok: true } | { ok: false; error: string }> => ({ ok: true }),
  ),
}))
vi.mock("@/lib/acciones/servidor", () => ({ conSesionDeConi }))

import { POST } from "@/app/(app)/biblioteca/temas/red-elegida/route"
import { RedElegida } from "@/lib/acciones/biblioteca"
import { ERROR_GENERICO, ERROR_SESION_VENCIDA, ERROR_SOLO_CONI } from "@/lib/acciones/resultado"

const pedir = (cuerpo: string) =>
  POST(new Request("http://app.test/biblioteca/temas/red-elegida", { method: "POST", body: cuerpo }))

beforeEach(() => vi.clearAllMocks())

describe("POST /biblioteca/temas/red-elegida", () => {
  it("records the network as Coni and answers with nothing, never cached", async () => {
    const respuesta = await pedir(JSON.stringify({ red: "instagram" }))
    expect(conSesionDeConi).toHaveBeenCalledWith("recordarRed", RedElegida, { red: "instagram" }, expect.any(Function))
    expect(respuesta.status).toBe(204)
    expect(respuesta.headers.get("cache-control")).toBe("no-store")
    expect(RedElegida.safeParse({ red: "youtube" }).success).toBe(false)
  })

  it("says a body that is not JSON, and each refusal with its status", async () => {
    expect((await pedir("no es json")).status).toBe(400)
    expect(conSesionDeConi).not.toHaveBeenCalled()
    for (const [error, estado] of [
      [ERROR_SESION_VENCIDA, 401],
      [ERROR_SOLO_CONI, 403],
      [ERROR_GENERICO, 502],
      ["No entendí esa solicitud. Vuelve a abrir la pantalla.", 400],
    ] as const) {
      conSesionDeConi.mockResolvedValueOnce({ ok: false, error })
      const respuesta = await pedir(JSON.stringify({ red: "tiktok" }))
      expect(respuesta.status, error).toBe(estado)
      expect(await respuesta.text()).toBe(error)
    }
  })
})
