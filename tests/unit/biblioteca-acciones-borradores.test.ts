// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

type Respuesta = { ok: boolean; error?: string; id?: string; pilarId?: string; red?: string }

const { conSesionDeConi, revalidatePath, redirect } = vi.hoisted(() => ({
  conSesionDeConi: vi.fn(async (..._: unknown[]): Promise<Respuesta> => ({ ok: true })),
  revalidatePath: vi.fn(),
  // Like Next's, it throws: nothing after it runs.
  redirect: vi.fn((): never => {
    throw new Error("NEXT_REDIRECT")
  }),
}))
vi.mock("next/cache", () => ({ revalidatePath }))
vi.mock("next/navigation", () => ({ redirect }))
vi.mock("@/lib/acciones/servidor", () => ({ conSesionDeConi }))

import {
  aprobarBorradorDePilarAccion,
  descartarBorradorAccion,
  editarBorradorDePilarAccion,
  editarBorradorDeRedAccion,
  guardarBorradorDePilarAccion,
  guardarBorradorDeRedAccion,
} from "@/app/(app)/biblioteca/temas/borradores/acciones"
import {
  AprobacionDePilar,
  BorradorDePilarNuevo,
  BorradorDeRedNuevo,
  EdicionDeBorradorDePilar,
  EdicionDeBorradorDeRed,
  SobreBorrador,
} from "@/lib/acciones/borradores"

const ID = "11111111-2222-4333-8444-555555555555"
const PILAR = "22222222-3333-4444-8555-666666666666"
const pilar = { nombre: "Liderazgo sereno", nombreCorto: "Sereno", descripcion: "Cómo decide.", peso: 10 }
const red = { nombre: "TikTok", manual: "", receta: "", conexion: "" }

beforeEach(() => vi.clearAllMocks())

describe("the drafts' server actions", () => {
  it.each([
    [
      "guardarBorradorDePilar",
      () => guardarBorradorDePilarAccion({ ...pilar, red: "instagram" }),
      BorradorDePilarNuevo,
      { ...pilar, red: "instagram" },
      "/biblioteca/temas?red=instagram&aviso=borrador-guardado",
    ],
    [
      "editarBorradorDePilar",
      () => editarBorradorDePilarAccion({ ...pilar, id: ID }),
      EdicionDeBorradorDePilar,
      { ...pilar, id: ID },
      "/biblioteca/temas/borradores?aviso=borrador-editado",
    ],
    [
      "guardarBorradorDeRed",
      () => guardarBorradorDeRedAccion(red),
      BorradorDeRedNuevo,
      red,
      "/biblioteca/temas?aviso=red-guardada",
    ],
    [
      "editarBorradorDeRed",
      () => editarBorradorDeRedAccion({ ...red, id: ID }),
      EdicionDeBorradorDeRed,
      { ...red, id: ID },
      "/biblioteca/temas/borradores?aviso=borrador-editado",
    ],
    [
      "descartarBorrador",
      () => descartarBorradorAccion({ tipo: "red", id: ID }),
      SobreBorrador,
      { tipo: "red", id: ID },
      "/biblioteca/temas/borradores?aviso=borrador-descartado",
    ],
  ] as const)(
    "%s checks Coni with its schema, refreshes the section and goes to its page with the note",
    async (nombre, accion, esquema, entrada, destino) => {
      await expect(accion()).rejects.toThrow("NEXT_REDIRECT")
      expect(conSesionDeConi).toHaveBeenCalledWith(nombre, esquema, entrada, expect.any(Function))
      expect(revalidatePath).toHaveBeenCalledWith("/biblioteca", "layout")
      expect(redirect).toHaveBeenCalledWith(destino, "replace")
    },
  )

  it("aprobarBorradorDePilar goes to Temas on the pillar's network with the new pillar chosen and the note", async () => {
    conSesionDeConi.mockResolvedValueOnce({ ok: true, pilarId: PILAR, red: "linkedin" })
    const pesos = { "2026-11-05": { nuevo: 10 } }
    await expect(aprobarBorradorDePilarAccion({ id: ID, pesos })).rejects.toThrow("NEXT_REDIRECT")
    expect(conSesionDeConi).toHaveBeenCalledWith(
      "aprobarBorradorDePilar",
      AprobacionDePilar,
      { id: ID, pesos },
      expect.any(Function),
    )
    expect(redirect).toHaveBeenCalledWith(
      `/biblioteca/temas?red=linkedin&pilar=${PILAR}&aviso=pilar-aprobado`,
      "replace",
    )
  })

  it("a refusal answers with the error, refreshes nothing and goes nowhere", async () => {
    conSesionDeConi.mockResolvedValueOnce({ ok: false, error: "Esta app es solo para Coni." })
    expect(await aprobarBorradorDePilarAccion({ id: ID, pesos: {} })).toEqual({
      ok: false,
      error: "Esta app es solo para Coni.",
    })
    expect(revalidatePath).not.toHaveBeenCalled()
    expect(redirect).not.toHaveBeenCalled()
  })

  it("the schemas refuse another network, an empty name, a weight out of range, a stage that is not a date and too many weights", () => {
    expect(BorradorDePilarNuevo.safeParse({ ...pilar, red: "youtube" }).success).toBe(false)
    expect(BorradorDePilarNuevo.safeParse({ ...pilar, red: "linkedin", nombre: "   " }).success).toBe(false)
    expect(BorradorDePilarNuevo.safeParse({ ...pilar, red: "linkedin", peso: 0 }).success).toBe(false)
    expect(AprobacionDePilar.safeParse({ id: ID, pesos: { "2026-11-05": { nuevo: 10 } } }).success).toBe(true)
    expect(AprobacionDePilar.safeParse({ id: ID, pesos: { "2026-11-05": { nuevo: 101 } } }).success).toBe(false)
    expect(AprobacionDePilar.safeParse({ id: ID, pesos: { hoy: { nuevo: 10 } } }).success).toBe(false)
    const muchos = Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`p${i}`, 5]))
    expect(AprobacionDePilar.safeParse({ id: ID, pesos: { "2026-11-05": muchos } }).success).toBe(false)
    expect(SobreBorrador.safeParse({ tipo: "tema", id: ID }).success).toBe(false)
  })
})
