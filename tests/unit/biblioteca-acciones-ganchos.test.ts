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

import { guardarMisTiposAccion, marcarFavoritoAccion } from "@/app/(app)/biblioteca/acciones"
import { CambioDeFavorito } from "@/lib/acciones/ganchos"

const ID = "11111111-2222-4333-8444-555555555555"

beforeEach(() => vi.clearAllMocks())

describe("marcarFavoritoAccion", () => {
  it("runs as Coni with its schema and refreshes the Biblioteca", async () => {
    expect(await marcarFavoritoAccion({ afirmacionId: ID, favorito: true })).toEqual({ ok: true })
    expect(conSesionDeConi).toHaveBeenCalledWith(
      "marcarFavorito",
      CambioDeFavorito,
      { afirmacionId: ID, favorito: true },
      expect.any(Function),
    )
    expect(revalidatePath).toHaveBeenCalledWith("/biblioteca", "layout")
  })

  it("does not refresh on a refusal", async () => {
    conSesionDeConi.mockResolvedValueOnce({ ok: false, error: "No." })
    expect(await marcarFavoritoAccion({ afirmacionId: ID, favorito: false })).toEqual({ ok: false, error: "No." })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe("guardarMisTiposAccion", () => {
  it("saves her types as Coni and refreshes the Biblioteca", async () => {
    expect(await guardarMisTiposAccion(["escena"])).toEqual({ ok: true })
    expect(conSesionDeConi).toHaveBeenCalledWith(
      "guardarMisTipos",
      expect.anything(),
      { valores: ["escena"] },
      expect.any(Function),
    )
    expect(revalidatePath).toHaveBeenCalledWith("/biblioteca", "layout")
  })

  it("hands over a schema that refuses an empty type", async () => {
    await guardarMisTiposAccion(["escena"])
    const esquema = conSesionDeConi.mock.calls[0]?.[1] as { safeParse: (v: unknown) => { success: boolean } }
    expect(esquema.safeParse({ valores: ["escena"] }).success).toBe(true)
    expect(esquema.safeParse({ valores: [""] }).success).toBe(false)
    expect(esquema.safeParse({ valores: ["x".repeat(61)] }).success).toBe(false)
  })

  it("does not refresh on a refusal", async () => {
    conSesionDeConi.mockResolvedValueOnce({ ok: false, error: "No." })
    expect(await guardarMisTiposAccion([])).toEqual({ ok: false, error: "No." })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
