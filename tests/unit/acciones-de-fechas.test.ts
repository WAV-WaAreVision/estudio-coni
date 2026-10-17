import { beforeEach, describe, expect, it, vi } from "vitest"
import { cambiarPropuestaAccion } from "@/app/(app)/calendario/acciones"

const { conSesionDeConi, revalidatePath } = vi.hoisted(() => ({
  conSesionDeConi: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock("next/cache", () => ({ revalidatePath }))
vi.mock("@/lib/acciones/servidor", () => ({ conSesionDeConi }))

const PIEZA = "00000000-0000-4000-8000-000000000001"

beforeEach(() => {
  conSesionDeConi.mockReset()
  revalidatePath.mockReset()
})

describe("Cambiar", () => {
  it("refreshes the Agenda when the slot was taken, so the other days she sees are free ones", async () => {
    const tomado = { ok: false, error: "Ese espacio ya no está libre. Elige otro." }
    conSesionDeConi.mockResolvedValue(tomado)

    expect(await cambiarPropuestaAccion(PIEZA, "2026-10-24T22:00:00.000Z")).toEqual(tomado)
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout")
  })
})
