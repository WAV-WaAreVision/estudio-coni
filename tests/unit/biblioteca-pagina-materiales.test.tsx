// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

// The page gates itself: a layout does not run again on client navigation and renders in parallel with its pages.
const { esConi, datos, leerAvisoAFederico } = vi.hoisted(() => ({
  leerAvisoAFederico: vi.fn(async (): Promise<{ avisado: boolean } | null> => null),
  esConi: { valor: false },
  datos: {
    listarMateriales: vi.fn(async () => []),
    contarPorEstado: vi.fn(async () => ({ procesando: 0, fallido: 0, trabajando: 0 })),
    listarAutores: vi.fn(async () => []),
    leerPanelDelMaterial: vi.fn(async (): Promise<unknown> => null),
    leerNombreDeLoBorrado: vi.fn(async (..._: unknown[]): Promise<{ nombre: string | null } | null> => null),
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
vi.mock("@/lib/datos/aviso-a-federico", () => ({ leerAvisoAFederico }))
vi.mock("@/lib/acciones/servidor", () => ({ clienteDeServicio: () => ({ servicio: true }) }))
vi.mock("@/app/(app)/acciones-avisar", () => ({ avisarAFedericoAccion: vi.fn() }))
// No provider paused: the pages read the open pauses through the same session.
vi.mock("@/lib/datos/pausas", () => ({ leerPausasAbiertas: async () => [] }))
vi.mock("@/app/(app)/biblioteca/acciones", () => ({
  reintentarMaterialAccion: vi.fn(),
  recuperarMaterialAccion: vi.fn(),
}))

import type { ReactElement, ReactNode } from "react"
import { AvisoDeBorrado } from "@/app/(app)/biblioteca/aviso-de-borrado"
import Materiales from "@/app/(app)/biblioteca/page"
import { PanelDeMaterial } from "@/app/(app)/biblioteca/panel-de-material"
import { TrasElAviso } from "@/app/(app)/biblioteca/tras-el-aviso"
import { RefrescoAutomatico } from "@/components/refresco-automatico"
import { ID_DEL_TITULO_DE_LA_LISTA } from "@/lib/dominio/biblioteca/borrado"

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

  it("narrows the panel's column to 20rem so the table breathes on a computer", async () => {
    esConi.valor = true
    const [raiz] = elementos(await Materiales({ searchParams: sinFiltros() }))
    expect(raiz?.props.className).toContain("md:grid-cols-[minmax(0,1fr)_20rem]")
  })
  const aSubir = (arbol: Elemento[]) =>
    arbol.filter((elemento) => (elemento.props as { href?: unknown }).href === "/biblioteca/subir")
  const conAviso = (arbol: Elemento[]) =>
    arbol.some((elemento) => (elemento.props as { titulo?: unknown }).titulo === "Lo estoy procesando.")

  it("links to Subir from its header and, with nothing uploaded yet, from the empty list too", async () => {
    esConi.valor = true
    expect(aSubir(elementos(await Materiales({ searchParams: sinFiltros() })))).toHaveLength(2)
  })

  it("keeps only the header's Subir when filters leave the list empty", async () => {
    esConi.valor = true
    const arbol = elementos(await Materiales({ searchParams: Promise.resolve({ estado: "listo" }) }))
    expect(aSubir(arbol)).toHaveLength(1)
  })

  it("says Lo estoy procesando. after an upload, and nothing otherwise", async () => {
    esConi.valor = true
    expect(conAviso(elementos(await Materiales({ searchParams: Promise.resolve({ subido: "1" }) })))).toBe(true)
    expect(conAviso(elementos(await Materiales({ searchParams: sinFiltros() })))).toBe(false)
  })
})

describe("the side panel of a material whose card cannot be read", () => {
  const ID = "11111111-2222-4333-8444-555555555555"
  const MATERIAL = { id: ID, titulo: "Plan", rol: "estrategia", estado: "listo" }

  it("asks whether Federico was told and hands it to the panel", async () => {
    esConi.valor = true
    leerAvisoAFederico.mockResolvedValueOnce({ avisado: true })
    datos.leerPanelDelMaterial.mockResolvedValueOnce({
      material: MATERIAL,
      ideas: { total: 0, primeras: [] },
      evidencia: {},
      fichaIlegible: true,
    })
    const arbol = elementos(await Materiales({ searchParams: Promise.resolve({ m: ID }) }))
    expect(leerAvisoAFederico).toHaveBeenCalledWith(expect.anything(), {
      tipo: "material",
      id: ID,
      explicacion: "No pude leer la ficha de este material.",
    })
    const panel = arbol.find((elemento) => elemento.type === PanelDeMaterial)
    expect((panel?.props as { avisoAFederico?: unknown }).avisoAFederico).toEqual({ avisado: true })
  })

  it("asks nothing for a card that reads", async () => {
    esConi.valor = true
    datos.leerPanelDelMaterial.mockResolvedValueOnce({
      material: MATERIAL,
      ideas: { total: 1, primeras: ["Una"] },
      evidencia: {},
      fichaIlegible: false,
    })
    const arbol = elementos(await Materiales({ searchParams: Promise.resolve({ m: ID }) }))
    expect(leerAvisoAFederico).not.toHaveBeenCalled()
    const panel = arbol.find((elemento) => elemento.type === PanelDeMaterial)
    expect((panel?.props as { avisoAFederico?: unknown }).avisoAFederico).toBeNull()
  })
})

describe("the note after a deletion", () => {
  const ID = "11111111-2222-4333-8444-555555555555"

  it("draws the toast with the deleted material's name and takes the note and the id out of the address", async () => {
    esConi.valor = true
    datos.leerNombreDeLoBorrado.mockResolvedValueOnce({ nombre: "Charla larga" })
    const arbol = elementos(await Materiales({ searchParams: Promise.resolve({ aviso: "borrado", id: ID }) }))
    expect(datos.leerNombreDeLoBorrado).toHaveBeenCalledWith(expect.anything(), "material", ID)
    expect(arbol.find((e) => e.type === AvisoDeBorrado)?.props).toEqual({
      tipo: "material",
      borrado: { id: ID, nombre: "Charla larga" },
    })
    expect(arbol.find((e) => e.type === TrasElAviso)?.props).toEqual({ parametro: "aviso", tambien: "id" })
  })

  it("keeps the toast mounted without a note, and reads nothing", async () => {
    esConi.valor = true
    const arbol = elementos(await Materiales({ searchParams: sinFiltros() }))
    expect(arbol.find((e) => e.type === AvisoDeBorrado)?.props).toEqual({ tipo: "material", borrado: null })
    expect(arbol.find((e) => e.type === TrasElAviso)).toBeUndefined()
    expect(datos.leerNombreDeLoBorrado).not.toHaveBeenCalled()
  })

  it("lets the toast give the focus back to the list's heading", async () => {
    esConi.valor = true
    const titulo = elementos(await Materiales({ searchParams: sinFiltros() })).find((e) => e.type === "h1")
    expect(titulo?.props).toMatchObject({ id: ID_DEL_TITULO_DE_LA_LISTA, tabIndex: -1 })
  })

  it("shows no toast when the material is no longer marked (a stale address), but still cleans the address", async () => {
    esConi.valor = true
    const arbol = elementos(await Materiales({ searchParams: Promise.resolve({ aviso: "borrado", id: ID }) }))
    expect(arbol.find((e) => e.type === AvisoDeBorrado)?.props).toEqual({ tipo: "material", borrado: null })
    expect(arbol.find((e) => e.type === TrasElAviso)).toBeDefined()
  })
})
