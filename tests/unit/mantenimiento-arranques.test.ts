// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"
import { arrancarGrabacion } from "../../trigger/mantenimiento"

const { trigger, crearClave } = vi.hoisted(() => ({
  trigger: vi.fn(async (..._: unknown[]) => ({ id: "run_1" })),
  crearClave: vi.fn(async (clave: string, _opciones: unknown) => `global:${clave}`),
}))
vi.mock("../../trigger/grabar-pieza", () => ({ grabarPiezaTask: { trigger } }))
vi.mock("@trigger.dev/sdk", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@trigger.dev/sdk")>()),
  idempotencyKeys: { create: crearClave },
}))

const PIEZA = "11111111-2222-4333-8444-555555555555"

beforeEach(() => {
  trigger.mockClear()
  crearClave.mockClear()
})

describe("arrancarGrabacion", () => {
  it("resumes the recording for the attempt the piece is on, under the same global key as the app", async () => {
    await arrancarGrabacion(PIEZA, "clave", 3)

    expect(crearClave).toHaveBeenCalledWith("clave", { scope: "global" })
    expect(trigger).toHaveBeenCalledWith(
      { piezaId: PIEZA, intento: 3 },
      { idempotencyKey: "global:clave", idempotencyKeyTTL: "1d" },
    )
  })
})
