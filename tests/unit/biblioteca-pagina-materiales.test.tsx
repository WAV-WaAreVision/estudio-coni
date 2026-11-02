// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

// The page gates itself: a layout does not run again on client navigation and renders in parallel with its pages.
const { esConi, datos } = vi.hoisted(() => ({
  esConi: { valor: false },
  datos: {
    listarMateriales: vi.fn(async () => []),
    contarPorEstado: vi.fn(async () => ({ procesando: 0, fallido: 0, trabajando: 0 })),
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

import type { ReactElement, ReactNode } from "react"
import Materiales from "@/app/(app)/biblioteca/page"
import { RefrescoAutomatico } from "@/components/refresco-automatico"

type Elemento = ReactElement<{ children?: ReactNode; className?: string; activo?: boolean }>

/** The elements of the page's tree, without rendering it (its children are server and client components). */
function elementos(nodo: ReactNode): Elemento[] {
  if (Array.isArray(nodo)) return nodo.flatMap(elementos)
  if (nodo === null || typeof nodo !== "object" || !("props" in nodo)) return []
  const elemento = nodo as Elemento
  return [elemento, ...elementos(elemento.props.children)]
}

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

  it("lets a long panel scroll inside its sticky column instead of running past the screen", async () => {
    esConi.valor = true
    const arbol = elementos(await Materiales({ searchParams: sinFiltros() }))
    const aside = arbol.find((elemento) => elemento.type === "aside")
    expect(aside?.props.className).toContain("md:max-h-[calc(100dvh-7rem)]")
    expect(aside?.props.className).toContain("md:overflow-y-auto")
  })

  it("keeps asking while anything is really working, even outside the filtered list", async () => {
    esConi.valor = true
    datos.contarPorEstado.mockResolvedValueOnce({ procesando: 1, fallido: 0, trabajando: 1 })
    const arbol = elementos(await Materiales({ searchParams: Promise.resolve({ estado: "listo" }) }))
    const refresco = arbol.find((elemento) => elemento.type === RefrescoAutomatico)
    expect(refresco?.props.activo).toBe(true)
  })

  it("stops asking when what processes is only paused or waiting for her OK", async () => {
    esConi.valor = true
    datos.contarPorEstado.mockResolvedValueOnce({ procesando: 2, fallido: 0, trabajando: 0 })
    const arbol = elementos(await Materiales({ searchParams: sinFiltros() }))
    expect(arbol.find((elemento) => elemento.type === RefrescoAutomatico)?.props.activo).toBe(false)
  })
})
