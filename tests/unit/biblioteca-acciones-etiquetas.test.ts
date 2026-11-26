// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

const { conSesionDeConi, revalidatePath } = vi.hoisted(() => ({
  conSesionDeConi: vi.fn(
    async (..._: unknown[]): Promise<{ ok: true } | { ok: false; error: string }> => ({ ok: true }),
  ),
  revalidatePath: vi.fn(),
}))
vi.mock("next/cache", () => ({ revalidatePath }))
vi.mock("next/navigation", () => ({ redirect: vi.fn() }))
vi.mock("@/lib/acciones/servidor", () => ({ conSesionDeConi, disparosDeBibliotecaDeLaApp: vi.fn() }))

import { confirmarEtiquetaAccion, corregirEtiquetaAccion, quitarMarcaAccion } from "@/app/(app)/biblioteca/acciones"
import { ConfirmacionDeEtiqueta, CorreccionDeEtiqueta, RetiroDeMarca } from "@/lib/acciones/etiquetas"

const ID = "11111111-2222-4333-8444-555555555555"
const MARCA = "aaaaaaaa-0000-4000-8000-000000000002"

beforeEach(() => vi.clearAllMocks())

describe("the tag actions (6c-1)", () => {
  it("run as Coni with their schemas and refresh the Biblioteca", async () => {
    const correccion = {
      afirmacionId: ID,
      campo: "emocion" as const,
      red: "instagram" as const,
      valor: "sorpresa",
      frase: "",
      porQue: "",
      marcaId: MARCA,
    }
    expect(await corregirEtiquetaAccion(correccion)).toEqual({ ok: true })
    expect(conSesionDeConi).toHaveBeenLastCalledWith(
      "corregirEtiqueta",
      CorreccionDeEtiqueta,
      correccion,
      expect.any(Function),
    )
    const confirmacion = { afirmacionId: ID, campo: "tipo" as const, red: "todas" as const, marcaId: null }
    expect(await confirmarEtiquetaAccion(confirmacion)).toEqual({ ok: true })
    expect(conSesionDeConi).toHaveBeenLastCalledWith(
      "confirmarEtiqueta",
      ConfirmacionDeEtiqueta,
      confirmacion,
      expect.any(Function),
    )
    const retiro = { afirmacionId: ID, marca: "emocion" as const, red: "instagram" as const, marcaId: MARCA }
    expect(await quitarMarcaAccion(retiro)).toEqual({ ok: true })
    expect(conSesionDeConi).toHaveBeenLastCalledWith("quitarMarca", RetiroDeMarca, retiro, expect.any(Function))
    expect(revalidatePath).toHaveBeenCalledTimes(3)
    expect(revalidatePath).toHaveBeenCalledWith("/biblioteca", "layout")
  })

  it("do not refresh on a refusal", async () => {
    conSesionDeConi.mockResolvedValueOnce({ ok: false, error: "No." })
    expect(await quitarMarcaAccion({ afirmacionId: ID, marca: "dato", red: "todas", marcaId: null })).toEqual({
      ok: false,
      error: "No.",
    })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
