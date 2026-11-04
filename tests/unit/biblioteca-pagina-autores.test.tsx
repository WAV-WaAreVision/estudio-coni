// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

const { esConi, datos } = vi.hoisted(() => ({
  esConi: { valor: false },
  datos: {
    resumirAutores: vi.fn(async (): Promise<unknown[]> => []),
    leerAutor: vi.fn(async (): Promise<unknown> => null),
    listarAutores: vi.fn(async (): Promise<unknown[]> => []),
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
vi.mock("@/app/(app)/biblioteca/acciones", () => ({ unirAutoresAccion: vi.fn(), ocultarIdeaAccion: vi.fn() }))

import type { ReactElement, ReactNode } from "react"
import { ListaDeAutores } from "@/app/(app)/biblioteca/autores/lista-de-autores"
import Autores from "@/app/(app)/biblioteca/autores/page"
import { PanelDeAutor } from "@/app/(app)/biblioteca/autores/panel-de-autor"

type Elemento = ReactElement<Record<string, unknown> & { children?: ReactNode }>

/** The elements of the page's tree, without rendering it (its children are server and client components). */
function elementos(nodo: ReactNode): Elemento[] {
  if (Array.isArray(nodo)) return nodo.flatMap(elementos)
  if (nodo === null || typeof nodo !== "object" || !("props" in nodo)) return []
  const elemento = nodo as Elemento
  return [elemento, ...elementos(elemento.props.children)]
}

const ID = "11111111-2222-4333-8444-555555555555"
const AUTOR = {
  id: ID,
  nombre: "Daniela Ruiz",
  credencial: null,
  tipo: "persona",
  alias: [],
  materiales: 1,
  ideas: 2,
  temas: [],
}

beforeEach(() => vi.clearAllMocks())

describe("the Autores page", () => {
  it("refuses a session that is not Coni's on its own, before reading anything", async () => {
    esConi.valor = false
    await expect(Autores({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_NOT_FOUND")
    expect(datos.resumirAutores).not.toHaveBeenCalled()
  })

  it("gives the summary to the list, with the row chosen in the address", async () => {
    esConi.valor = true
    datos.resumirAutores.mockResolvedValueOnce([AUTOR])
    const arbol = elementos(await Autores({ searchParams: Promise.resolve({ a: ID }) }))
    const lista = arbol.find((elemento) => elemento.type === ListaDeAutores)
    expect(lista?.props.autores).toEqual([AUTOR])
    expect(lista?.props.seleccion).toBe(ID)
    expect(arbol.find((elemento) => elemento.type === PanelDeAutor)?.props.autor).toEqual(AUTOR)
  })

  it("says it found nobody for a chosen row that is not in the list, and hints with none", async () => {
    esConi.valor = true
    datos.resumirAutores.mockResolvedValue([AUTOR])
    const otro = elementos(
      await Autores({ searchParams: Promise.resolve({ a: "99999999-2222-4333-8444-555555555555" }) }),
    )
    expect(otro.some((elemento) => elemento.type === PanelDeAutor)).toBe(false)
    expect(otro.some((e) => e.props.children === "No encontré a esa persona. Elige otra de la tabla.")).toBe(true)
    const ninguno = elementos(await Autores({ searchParams: Promise.resolve({}) }))
    expect(
      ninguno.some(
        (e) => e.props.children === "Elige un autor de la tabla para ver aquí sus temas y sus ideas sacadas.",
      ),
    ).toBe(true)
  })
})
