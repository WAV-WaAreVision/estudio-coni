// @vitest-environment node
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { disparosDeEntorno } from "@/lib/acciones/disparos-entorno"

const { trigger } = vi.hoisted(() => ({ trigger: vi.fn(async (..._: unknown[]) => ({ id: "run_1" })) }))
vi.mock("@trigger.dev/sdk", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@trigger.dev/sdk")>()),
  tasks: { trigger },
  idempotencyKeys: { create: vi.fn(async (clave: string) => `global:${clave}`) },
}))

const PIEZA = "11111111-2222-4333-8444-555555555555"

beforeEach(() => trigger.mockClear())

describe("grabar-pieza con retraso", () => {
  it("asks Trigger.dev to start the render after the delay, under the same key", async () => {
    await disparosDeEntorno({ TRIGGER_SECRET_KEY: "tr_prueba" }).grabar(PIEZA, "clave", "10s")

    expect(trigger).toHaveBeenCalledWith(
      "grabar-pieza",
      { piezaId: PIEZA },
      { idempotencyKey: "global:clave", delay: "10s" },
    )
  })

  it("starts it at once when no delay is given", async () => {
    await disparosDeEntorno({ TRIGGER_SECRET_KEY: "tr_prueba" }).grabar(PIEZA, "clave")

    expect(trigger).toHaveBeenCalledWith("grabar-pieza", { piezaId: PIEZA }, { idempotencyKey: "global:clave" })
  })

  it("writes the delay down in test mode, so the E2E can see it", async () => {
    const archivo = join(mkdtempSync(join(tmpdir(), "disparos-")), "registro.jsonl")

    await disparosDeEntorno({ DISPARO_DE_PRUEBA: "1", DISPARO_DE_PRUEBA_ARCHIVO: archivo }).grabar(
      "p2",
      "clave-2",
      "10s",
    )

    expect(JSON.parse(readFileSync(archivo, "utf-8").trim())).toEqual({
      tarea: "grabar",
      piezaId: "p2",
      clave: "clave-2",
      retraso: "10s",
    })
  })
})
