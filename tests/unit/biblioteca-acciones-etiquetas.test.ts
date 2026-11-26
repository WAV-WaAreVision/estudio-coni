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
import { ConfirmacionDeEtiqueta, CorreccionDeEtiqueta, RetiroDeMarca, rechazo } from "@/lib/acciones/etiquetas"
import { ERROR_SOLO_CONI } from "@/lib/acciones/resultado"
import { RECHAZOS_DE_ETIQUETA } from "@/lib/dominio/biblioteca/etiquetas-de-afirmacion"
import { Falla } from "@/lib/dominio/falla"

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

describe("rechazo", () => {
  it("says the session's refusal as ERROR_SOLO_CONI and a known refusal in her words", () => {
    const soloConi = rechazo("No pude corregir", { message: "solo_coni_corrige" })
    expect(soloConi).toBeInstanceOf(Falla)
    expect(soloConi.message).toBe(ERROR_SOLO_CONI)
    const antigua = rechazo("No pude corregir", { message: "afirmacion_antigua" })
    expect(antigua).toBeInstanceOf(Falla)
    expect(antigua.message).toBe(RECHAZOS_DE_ETIQUETA.afirmacion_antigua)
  })

  it("keeps any other error for WAV's log, a name the prototype carries included", () => {
    for (const message of ["toString", "constructor", "__proto__", "red_invalida"]) {
      const error = rechazo("No pude corregir", { message })
      expect(error).not.toBeInstanceOf(Falla)
      expect(error.message).toBe(`No pude corregir: ${message}`)
    }
  })
})
