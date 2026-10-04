// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"
import { disparosDeEntorno } from "@/lib/acciones/disparos-entorno"
import { CONFIGURACION_VOZ } from "../../trigger/grabar-voz"

const { trigger } = vi.hoisted(() => ({ trigger: vi.fn(async (..._: unknown[]) => ({ id: "run_1" })) }))
vi.mock("@trigger.dev/sdk", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@trigger.dev/sdk")>()),
  tasks: { trigger },
  idempotencyKeys: { create: vi.fn(async (clave: string) => `global:${clave}`) },
}))

const PIEZA = "11111111-2222-4333-8444-555555555555"

beforeEach(() => trigger.mockClear())

describe("grabar-voz por pieza", () => {
  it("starts the run under a concurrency key of the piece, so one piece never speaks twice at once", async () => {
    await disparosDeEntorno({ TRIGGER_SECRET_KEY: "tr_prueba" }).voz(PIEZA, "clave", true)

    expect(trigger).toHaveBeenCalledWith(
      "grabar-voz",
      { piezaId: PIEZA, nueva: true },
      { idempotencyKey: "global:clave", concurrencyKey: PIEZA },
    )
  })

  it("lets one run at a time through each key, and other pieces go in parallel", () => {
    expect(CONFIGURACION_VOZ.queue).toEqual({ concurrencyLimit: 1 })
  })
})
