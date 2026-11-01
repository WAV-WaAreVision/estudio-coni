import { beforeEach, describe, expect, it, vi } from "vitest"
import type { z } from "zod"
import { publicarTransparenciaAccion } from "@/app/(app)/ajustes/acciones"

const { conSesionDeConi, revalidatePath } = vi.hoisted(() => ({
  conSesionDeConi: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock("next/cache", () => ({ revalidatePath }))
vi.mock("@/lib/acciones/servidor", () => ({ conSesionDeConi }))

beforeEach(() => {
  conSesionDeConi.mockReset()
  conSesionDeConi.mockResolvedValue({ ok: true, version: 1 })
})

async function esquemaDePublicar(texto: string, motivo: string): Promise<z.ZodType> {
  await publicarTransparenciaAccion(texto, motivo)
  return conSesionDeConi.mock.calls[0][1]
}

describe("publicarTransparenciaAccion", () => {
  it("lets the database judge a text that is long before trimming but fits after it", async () => {
    const texto = `${"a".repeat(5900)}${" ".repeat(1500)}`
    const esquema = await esquemaDePublicar(texto, "Cambio")
    expect(esquema.safeParse({ texto, motivo: "Cambio" }).success).toBe(true)
  })

  it("lets the database answer a text or a reason over its limit with the plain message", async () => {
    const texto = "a".repeat(6500)
    const motivo = "b".repeat(500)
    const esquema = await esquemaDePublicar(texto, motivo)
    expect(esquema.safeParse({ texto, motivo }).success).toBe(true)
  })

  it("still refuses a request far too big to be a page", async () => {
    const esquema = await esquemaDePublicar("x", "y")
    expect(esquema.safeParse({ texto: "a".repeat(60_001), motivo: "y" }).success).toBe(false)
    expect(esquema.safeParse({ texto: "x", motivo: "b".repeat(4_001) }).success).toBe(false)
  })
})
