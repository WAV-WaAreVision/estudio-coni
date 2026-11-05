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

const pedir = (cuerpo: string, encabezados: Record<string, string> = {}) =>
  POST(
    new Request("http://app.test/biblioteca/temas/red-elegida", { method: "POST", body: cuerpo, headers: encabezados }),
  )

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
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    expect((await pedir("no es json")).status).toBe(400)
    expect(aviso).toHaveBeenCalledWith("red-elegida: el cuerpo no es JSON", expect.any(SyntaxError))
    aviso.mockRestore()
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

  it("refuses a request another site sends, and takes one from the app itself", async () => {
    const ajena = await pedir(JSON.stringify({ red: "instagram" }), { origin: "https://otro.test" })
    expect(ajena.status).toBe(403)
    expect(conSesionDeConi).not.toHaveBeenCalled()
    const propia = await pedir(JSON.stringify({ red: "instagram" }), { origin: "http://app.test" })
    expect(propia.status).toBe(204)
  })

  it("compares the origin with the host the browser asked for, not the server's own address", async () => {
    // `next start` may build request.url from its own host; the browser asked for 127.0.0.1:3200.
    const local = await pedir(JSON.stringify({ red: "instagram" }), {
      origin: "http://127.0.0.1:3200",
      host: "127.0.0.1:3200",
    })
    expect(local.status).toBe(204)
    // Behind Vercel's proxy the asked-for host is x-forwarded-host.
    const tras = await pedir(JSON.stringify({ red: "instagram" }), {
      origin: "https://conidolly.vercel.app",
      host: "interno:3000",
      "x-forwarded-host": "conidolly.vercel.app",
    })
    expect(tras.status).toBe(204)
    const ajena = await pedir(JSON.stringify({ red: "instagram" }), {
      origin: "https://otro.test",
      host: "127.0.0.1:3200",
    })
    expect(ajena.status).toBe(403)
  })
})
