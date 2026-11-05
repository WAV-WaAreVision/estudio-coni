import { beforeEach, describe, expect, it, vi } from "vitest"
import { crearIdeaPropiaAccion, descartarIdeasAccion, restaurarIdeasAccion } from "@/app/(app)/ideas/acciones"
import { elegirLoteAccion } from "@/app/(app)/piezas/acciones"

const { comoConi, conSesionDeConi, revalidatePath } = vi.hoisted(() => ({
  comoConi: vi.fn(),
  conSesionDeConi: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock("next/cache", () => ({ revalidatePath }))
vi.mock("@/lib/acciones/servidor", () => ({
  comoConi,
  conSesionDeConi,
  clienteDeServicio: vi.fn(),
  disparosDeLaApp: vi.fn(),
}))

const FALLA = { ok: false, error: "No pude escribir en la base." }
const IDEA = "00000000-0000-4000-8000-000000000001"

beforeEach(() => {
  comoConi.mockReset()
  conSesionDeConi.mockReset()
  revalidatePath.mockReset()
})

describe("batch actions on Ideas", () => {
  it("refresh the screens even when the batch was refused, since part of it may have changed", async () => {
    comoConi.mockResolvedValue(FALLA)
    conSesionDeConi.mockResolvedValue(FALLA)

    expect(await elegirLoteAccion([IDEA])).toEqual(FALLA)
    expect(await descartarIdeasAccion([IDEA], "debil")).toEqual(FALLA)
    expect(await restaurarIdeasAccion([IDEA])).toEqual(FALLA)
    expect(revalidatePath).toHaveBeenCalledTimes(3)
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout")
  })
})

describe("her own idea's action", () => {
  it("reads an idea sent without an angle as one without angle, as the domain does", async () => {
    conSesionDeConi.mockResolvedValue({ ok: true, id: IDEA })
    const idea = { gancho: "Gancho", tema: "Tema", formato: "Mito o realidad", pilar: "caso-coni", alertas: [] }
    await crearIdeaPropiaAccion(idea)
    const esquema = conSesionDeConi.mock.calls[0]?.[1] as {
      safeParse: (valor: unknown) => { success: boolean; data?: unknown }
    }
    expect(esquema.safeParse(idea)).toEqual({ success: true, data: { ...idea, angulo: null } })
  })
})
