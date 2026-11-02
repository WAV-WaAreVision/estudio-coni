// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

// The page gates itself: a layout does not run again on client navigation and renders in parallel with its pages.
const { esConi, datos } = vi.hoisted(() => ({
  esConi: { valor: false },
  datos: {
    listarMateriales: vi.fn(async () => []),
    contarPorEstado: vi.fn(async () => ({ procesando: 0, fallido: 0 })),
    listarAutores: vi.fn(async () => []),
    leerPanelDelMaterial: vi.fn(async () => null),
  },
}))
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u-1", email: "alguien@ejemplo.cl" } } }) },
    rpc: async () => ({ data: esConi.valor, error: null }),
  }),
}))
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND")
  },
  redirect: (ruta: string) => {
    throw new Error(`NEXT_REDIRECT ${ruta}`)
  },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}))
vi.mock("@/lib/datos/biblioteca", () => datos)
vi.mock("@/app/(app)/biblioteca/acciones", () => ({ reintentarMaterialAccion: vi.fn(), confirmarCostoAccion: vi.fn() }))

import Materiales from "@/app/(app)/biblioteca/page"

const sinFiltros = () => Promise.resolve({})

beforeEach(() => vi.clearAllMocks())

describe("the Materiales page", () => {
  it("refuses a session that is not Coni's on its own, before reading anything", async () => {
    esConi.valor = false
    await expect(Materiales({ searchParams: sinFiltros() })).rejects.toThrow("NEXT_NOT_FOUND")
    expect(datos.listarMateriales).not.toHaveBeenCalled()
    expect(datos.contarPorEstado).not.toHaveBeenCalled()
  })

  it("reads the list for Coni", async () => {
    esConi.valor = true
    await Materiales({ searchParams: sinFiltros() })
    expect(datos.listarMateriales).toHaveBeenCalledWith(expect.anything(), {})
    expect(datos.leerPanelDelMaterial).not.toHaveBeenCalled()
  })
})
