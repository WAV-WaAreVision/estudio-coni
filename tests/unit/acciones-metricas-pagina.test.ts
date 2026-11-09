// @vitest-environment node
import { describe, expect, it, vi } from "vitest"
import { guardarDudososDeLinkedinAccion } from "@/app/(app)/metricas/acciones"
import { ERROR_MISMO_POST } from "@/lib/acciones/excel-linkedin"

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
// The real session check needs cookies and a database; what this test cares about is what the schema lets through.
vi.mock("@/lib/acciones/servidor", () => ({
  comoConi: async (
    _nombre: string,
    esquema: { safeParse: (entrada: unknown) => { success: boolean; data?: unknown } },
    entrada: unknown,
    trabajo: (deps: unknown, datos: unknown) => Promise<unknown>,
  ) => {
    const datos = esquema.safeParse(entrada)
    if (!datos.success) return { ok: false, error: "No entendí esa solicitud. Vuelve a abrir la pantalla." }
    return trabajo({ db: {}, ahora: () => "2026-11-09T15:00:00.000Z" }, datos.data)
  },
}))

describe("guardarDudososDeLinkedinAccion", () => {
  it("tells Coni which mistake it is when she picks one Excel post for two pieces", async () => {
    const elegidos = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"].map(
      (piezaId) => ({ piezaId, clave: "share:1", impresiones: 10, interacciones: 1 }),
    )

    expect(await guardarDudososDeLinkedinAccion({ medidoEn: "2026-10-30", elegidos })).toEqual({
      ok: false,
      error: ERROR_MISMO_POST,
    })
  })
})
