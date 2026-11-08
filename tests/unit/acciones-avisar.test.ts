import { beforeEach, describe, expect, it, vi } from "vitest"
import type { z } from "zod"
import { avisarAFedericoAccion } from "@/app/(app)/acciones-avisar"

const { conSesionDeConi } = vi.hoisted(() => ({ conSesionDeConi: vi.fn() }))

vi.mock("@/lib/acciones/servidor", () => ({ conSesionDeConi, clienteDeServicio: vi.fn() }))

beforeEach(() => {
  conSesionDeConi.mockReset()
  conSesionDeConi.mockResolvedValue({})
})

async function esquema(): Promise<z.ZodType> {
  await avisarAFedericoAccion({ tipo: "pieza", id: crypto.randomUUID() })
  return conSesionDeConi.mock.calls[0][1]
}

describe("avisarAFedericoAccion schema", () => {
  it("accepts a piece with a balance motivo", async () => {
    const id = crypto.randomUUID()
    expect((await esquema()).safeParse({ tipo: "pieza", id, motivo: "saldo_voz" }).success).toBe(true)
  })

  it("refuses a piece with an unknown motivo", async () => {
    const id = crypto.randomUUID()
    expect((await esquema()).safeParse({ tipo: "pieza", id, motivo: "otro" }).success).toBe(false)
  })

  it("drops a motivo sent with a material", async () => {
    const id = crypto.randomUUID()
    const resultado = (await esquema()).safeParse({ tipo: "material", id, motivo: "saldo_voz" })
    expect(resultado.success && resultado.data).toEqual({ tipo: "material", id })
  })
})
