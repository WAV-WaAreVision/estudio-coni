// @vitest-environment node
import { describe, expect, it, vi } from "vitest"
import { disparosDeBibliotecaDeEntorno } from "@/lib/acciones/disparos-entorno"

const { trigger } = vi.hoisted(() => ({ trigger: vi.fn(async (..._: unknown[]) => ({ id: "run_1" })) }))
vi.mock("@trigger.dev/sdk", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@trigger.dev/sdk")>()),
  tasks: { trigger },
  idempotencyKeys: { create: vi.fn(async (clave: string) => `global:${clave}`) },
}))

describe("motor-manual", () => {
  it("sends the week «Proponer ahora» validated, the same one its key names", async () => {
    await disparosDeBibliotecaDeEntorno({ TRIGGER_SECRET_KEY: "tr_prueba" }).motor("2026-11-08")

    expect(trigger).toHaveBeenCalledWith(
      "motor-manual",
      { manual: true, semana: "2026-11-08" },
      { idempotencyKey: "global:motor:2026-11-08", idempotencyKeyTTL: "10m" },
    )
  })
})
