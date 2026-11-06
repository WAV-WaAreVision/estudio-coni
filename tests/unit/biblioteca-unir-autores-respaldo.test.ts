// @vitest-environment node
import { describe, expect, it, vi } from "vitest"

const { conSesionDeConi } = vi.hoisted(() => ({
  conSesionDeConi: vi.fn(
    async (..._: unknown[]): Promise<{ ok: true } | { ok: false; error: string }> => ({ ok: true }),
  ),
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
// These tests are about the work inside the session; where the action goes after it is pinned elsewhere.
vi.mock("next/navigation", () => ({ redirect: vi.fn() }))
vi.mock("@/lib/acciones/servidor", () => ({ conSesionDeConi, disparosDeBibliotecaDeLaApp: vi.fn() }))

import { unirAutoresAccion } from "@/app/(app)/biblioteca/acciones"
import { ERROR_GENERICO } from "@/lib/acciones/resultado"

const ORIGEN = "11111111-2222-4333-8444-555555555555"
const DESTINO = "22222222-3333-4444-8555-666666666666"
const CON_LETRAS = "abcdef12-3456-4789-8abc-def012345678"

/** A session whose origin reads as someone else, but the database protects it anyway (it became Coni's meanwhile). */
function sesionQueLaBaseRechaza(message: string) {
  return {
    rpc: async (nombre: string) =>
      nombre === "es_coni" ? { data: true, error: null } : { data: null, error: { code: "22023", message } },
    from: () => ({
      select: () => ({
        eq: () => ({ is: () => ({ maybeSingle: async () => ({ data: { tipo: "persona" }, error: null }) }) }),
      }),
    }),
  }
}

async function unirCon(db: unknown) {
  await unirAutoresAccion({ origen: ORIGEN, destino: DESTINO })
  const trabajo = conSesionDeConi.mock.calls.at(-1)?.[3] as (db: unknown, d: unknown) => Promise<unknown>
  return trabajo(db, { origen: ORIGEN, destino: DESTINO })
}

describe("unirAutores when the database refuses what the app let through", () => {
  it("answers in her words when the database protects Coni's own card", async () => {
    expect(await unirCon(sesionQueLaBaseRechaza("autor_coni_protegido"))).toEqual({
      ok: false,
      error: "Tu propia ficha no se puede unir a otro autor.",
    })
  })

  it("answers in her words when the database sees the same author twice", async () => {
    expect(await unirCon(sesionQueLaBaseRechaza("autores_iguales"))).toEqual({
      ok: false,
      error: "Elige otro autor para unirlos.",
    })
  })

  it("answers in plain words for any other refusal of that kind", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    expect(await unirCon(sesionQueLaBaseRechaza("otra_cosa"))).toEqual({ ok: false, error: ERROR_GENERICO })
  })

  it("sees the same author in another case before asking the database", async () => {
    const rpc = vi.fn(async (nombre: string) =>
      nombre === "es_coni" ? { data: true, error: null } : { data: null, error: null },
    )
    const db = { ...sesionQueLaBaseRechaza(""), rpc }
    const union = { origen: CON_LETRAS, destino: CON_LETRAS.toUpperCase() }
    await unirAutoresAccion(union)
    const trabajo = conSesionDeConi.mock.calls.at(-1)?.[3] as (db: unknown, d: unknown) => Promise<unknown>
    expect(await trabajo(db, union)).toEqual({
      ok: false,
      error: "Elige otro autor para unirlos.",
    })
    expect(rpc).not.toHaveBeenCalledWith("fusionar_autores", expect.anything())
  })
})
