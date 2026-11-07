// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest"
import type { z } from "zod"

type Respuesta = { ok: true } | { ok: false; error: string }
interface DepsRecibidas {
  db: unknown
  disparar: unknown
  ahora: () => Date
}

const { conSesionDeConi, revalidatePath, redirect, proponerAhora, disparos } = vi.hoisted(() => ({
  conSesionDeConi: vi.fn(async (..._: unknown[]): Promise<Respuesta> => ({ ok: true })),
  revalidatePath: vi.fn(),
  redirect: vi.fn((): never => {
    throw new Error("NEXT_REDIRECT")
  }),
  proponerAhora: vi.fn(async (_deps: DepsRecibidas): Promise<Respuesta> => ({ ok: true })),
  disparos: { material: vi.fn(), motor: vi.fn() },
}))
vi.mock("next/cache", () => ({ revalidatePath }))
vi.mock("next/navigation", () => ({ redirect }))
vi.mock("@/lib/acciones/servidor", () => ({ conSesionDeConi, disparosDeBibliotecaDeLaApp: () => disparos }))
vi.mock("@/lib/acciones/semana", () => ({ proponerAhora }))

import { proponerAhoraAccion } from "@/app/(app)/biblioteca/semana/acciones"

beforeEach(() => vi.clearAllMocks())

describe("proponerAhoraAccion", () => {
  it("checks Coni with no input, asks with her client, the app's starters and the clock, and redraws Semana", async () => {
    expect(await proponerAhoraAccion()).toEqual({ ok: true })
    const [nombre, esquema, entrada, trabajo] = conSesionDeConi.mock.calls[0] ?? []
    expect(nombre).toBe("proponerAhora")
    expect(entrada).toEqual({})
    expect((esquema as z.ZodType).safeParse({}).success).toBe(true)
    const db = {}
    await (trabajo as (db: unknown, d: unknown) => Promise<unknown>)(db, {})
    const recibidas = proponerAhora.mock.calls[0]?.[0]
    expect(recibidas?.db).toBe(db)
    expect(recibidas?.disparar).toBe(disparos)
    expect(recibidas?.ahora()).toBeInstanceOf(Date)
    expect(revalidatePath).toHaveBeenCalledWith("/biblioteca/semana")
    expect(redirect).not.toHaveBeenCalled()
  })

  it("answers a refusal as it came and redraws nothing", async () => {
    conSesionDeConi.mockResolvedValueOnce({ ok: false, error: "El motor ya propuso ideas esta semana." })
    expect(await proponerAhoraAccion()).toEqual({ ok: false, error: "El motor ya propuso ideas esta semana." })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
