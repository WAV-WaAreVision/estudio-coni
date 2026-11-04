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
import DetalleDeAutor from "@/app/(app)/biblioteca/autores/[id]/page"
import { UnirAutores } from "@/app/(app)/biblioteca/autores/[id]/unir-autores"
import { ListaDeAutores } from "@/app/(app)/biblioteca/autores/lista-de-autores"
import Autores from "@/app/(app)/biblioteca/autores/page"
import { PanelDeAutor } from "@/app/(app)/biblioteca/autores/panel-de-autor"
import { BotonOcultar } from "@/app/(app)/biblioteca/boton-ocultar"
import { ListaDeIdeas } from "@/app/(app)/biblioteca/lista-de-ideas"
import { MasOpciones } from "@/components/ui/mas-opciones"
import type { IdeaLeida } from "@/lib/dominio/biblioteca/ideas"

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

const OTRO = "99999999-2222-4333-8444-555555555555"
const IDEA = { id: "i-1", texto: "Una idea", tipo: "dato", evidencia: "estudio" }
const OCULTA = { id: "i-2", texto: "Una oculta", tipo: "mito", evidencia: "opinion" }
const leido = (tipo: string) => ({
  autor: { id: ID, nombre: "Daniela Ruiz", credencial: null, tipo, alias: [] },
  materiales: 1,
  ideas: 1,
  grupos: [{ tema: { id: "t1", nombre: "Carga mental" }, ideas: [IDEA] }],
  ocultas: [OCULTA],
})
const LISTA = [
  { id: ID, nombre: "Daniela Ruiz", credencial: null, tipo: "persona", alias: [] },
  { id: OTRO, nombre: "D. Ruiz", credencial: null, tipo: "persona", alias: [] },
]
const conId = (id: string) => ({ params: Promise.resolve({ id }) })

describe("an author's page", () => {
  it("refuses what is not an id before reading, and an author that does not exist", async () => {
    esConi.valor = true
    await expect(DetalleDeAutor(conId("no-es-un-id"))).rejects.toThrow("NEXT_NOT_FOUND")
    expect(datos.leerAutor).not.toHaveBeenCalled()
    datos.leerAutor.mockResolvedValueOnce(null)
    await expect(DetalleDeAutor(conId(ID))).rejects.toThrow("NEXT_NOT_FOUND")
  })

  it("offers joining on another author's page, with everyone else to pick from", async () => {
    esConi.valor = true
    datos.leerAutor.mockResolvedValueOnce(leido("persona"))
    datos.listarAutores.mockResolvedValueOnce(LISTA)
    const unir = elementos(await DetalleDeAutor(conId(ID))).find((elemento) => elemento.type === UnirAutores)
    expect(unir?.props.origen).toEqual({ id: ID, nombre: "Daniela Ruiz" })
    expect((unir?.props.otros as { id: string }[]).map((autor) => autor.id)).toEqual([OTRO])
  })

  it("never offers joining on Coni's own page", async () => {
    esConi.valor = true
    datos.leerAutor.mockResolvedValueOnce(leido("coni"))
    const arbol = elementos(await DetalleDeAutor(conId(ID)))
    expect(arbol.some((elemento) => elemento.type === UnirAutores)).toBe(false)
  })

  it("folds the hidden ideas under «Ideas ocultas (N)», each with Mostrar that redraws in place", async () => {
    esConi.valor = true
    datos.leerAutor.mockResolvedValueOnce(leido("persona"))
    const arbol = elementos(await DetalleDeAutor(conId(ID)))
    expect(arbol.find((elemento) => elemento.type === MasOpciones)?.props.titulo).toBe("Ideas ocultas (1)")
    const ocultas = arbol.find(
      (elemento) => elemento.type === ListaDeIdeas && elemento.props.etiqueta === "Ideas ocultas",
    )
    const accion = ocultas?.props.accion as (idea: IdeaLeida) => Elemento
    const boton = accion(OCULTA)
    expect(boton.type).toBe(BotonOcultar)
    expect(boton.props).toEqual({ ideaId: "i-2", oculta: true, despues: null })
    const visibles = arbol.find(
      (elemento) => elemento.type === ListaDeIdeas && elemento.props.etiqueta === "Ideas sobre Carga mental",
    )
    expect(visibles?.props.accion).toBeUndefined()
  })
})
