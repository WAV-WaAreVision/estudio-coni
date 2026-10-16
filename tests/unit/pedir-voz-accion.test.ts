import { beforeEach, describe, expect, it, vi } from "vitest"
import { pedirVozAccion } from "@/app/(app)/piezas/acciones"

const { comoConi, revalidatePath } = vi.hoisted(() => ({ comoConi: vi.fn(), revalidatePath: vi.fn() }))

vi.mock("next/cache", () => ({ revalidatePath }))
vi.mock("@/lib/acciones/servidor", () => ({
  comoConi,
  conSesionDeConi: vi.fn(),
  clienteDeServicio: vi.fn(),
  disparosDeLaApp: vi.fn(),
}))

beforeEach(() => {
  comoConi.mockReset()
  revalidatePath.mockReset()
})

describe("pedirVozAccion", () => {
  it("refreshes the screens even when the voice did not start, since the piece moved on", async () => {
    const falla = { ok: false, error: "No pude preparar tu voz. Vuelve a intentarlo con Preparar mi voz." }
    comoConi.mockResolvedValue(falla)

    expect(await pedirVozAccion("p1", 5, false)).toEqual(falla)
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout")
  })

  it("refreshes the screens when the voice started", async () => {
    comoConi.mockResolvedValue({ ok: true })

    expect(await pedirVozAccion("p1", 5, true)).toEqual({ ok: true })
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout")
  })
})
