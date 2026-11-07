import type { SupabaseClient } from "@supabase/supabase-js"
import { describe, expect, it, vi } from "vitest"
import { cambiarAngulo, type DepsIdeas } from "@/lib/acciones/ideas"
import { ERROR_GENERICO } from "@/lib/acciones/resultado"
import { notificadorEnMemoria } from "@/lib/proveedores/avisos"
import type { Database } from "@/lib/supabase/database.types"

const IDEA = "33333333-3333-4333-8333-333333333333"
const ANGULO = "11111111-1111-4111-8111-111111111111"

/** A database whose update of `ideas` answers `respuesta`: the boundary, not our code. */
function deps(respuesta: { data: unknown; error: { code: string; message: string } | null }): DepsIdeas {
  const cadena = {
    update: () => cadena,
    eq: () => cadena,
    select: () => cadena,
    maybeSingle: async () => respuesta,
  }
  return {
    db: { from: () => cadena } as unknown as SupabaseClient<Database>,
    servicio: vi.fn(),
    crearClaude: vi.fn(),
    avisos: notificadorEnMemoria(),
    ahora: () => new Date().toISOString(),
  }
}

describe("cambiarAngulo's refusals", () => {
  it("says another check's refusal as a generic failure, never as an angle of another pillar", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    expect(
      await cambiarAngulo(deps({ data: null, error: { code: "23514", message: "otra_regla" } }), {
        ideaId: IDEA,
        anguloId: ANGULO,
      }),
    ).toEqual({ ok: false, error: ERROR_GENERICO })
  })

  it("answers a malformed request as an idea no longer there, not as an angle of another pillar", async () => {
    expect(await cambiarAngulo(deps({ data: { id: IDEA }, error: null }), { ideaId: "x", anguloId: ANGULO })).toEqual({
      ok: false,
      error: "Esa idea ya no está disponible.",
    })
  })
})
