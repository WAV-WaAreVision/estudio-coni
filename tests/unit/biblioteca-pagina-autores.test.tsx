// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

const { esConi, datos } = vi.hoisted(() => ({
  esConi: { valor: false },
  datos: {
    resumirAutores: vi.fn(async (): Promise<unknown[]> => []),
    leerAutor: vi.fn(async (): Promise<unknown> => null),
    listarAutores: vi.fn(async (): Promise<unknown[]> => []),
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
vi.mock("@/app/(app)/biblioteca/acciones", () => ({
  unirAutoresAccion: vi.fn(),
  ocultarIdeaAccion: vi.fn(),
  borrarAutorAccion: vi.fn(),
  recuperarAutorAccion: vi.fn(),
}))

import type { ReactElement, ReactNode } from "react"
import DetalleDeAutor from "@/app/(app)/biblioteca/autores/[id]/page"
import { UnirAutores } from "@/app/(app)/biblioteca/autores/[id]/unir-autores"
import { ListaDeAutores } from "@/app/(app)/biblioteca/autores/lista-de-autores"
import Autores from "@/app/(app)/biblioteca/autores/page"
import { PanelDeAutor } from "@/app/(app)/biblioteca/autores/panel-de-autor"
import { SinMaterial } from "@/app/(app)/biblioteca/autores/sin-material"
import { AvisoDeBorrado } from "@/app/(app)/biblioteca/aviso-de-borrado"
import { AvisoDeIdeas } from "@/app/(app)/biblioteca/aviso-de-ideas"
import { BotonBorrar } from "@/app/(app)/biblioteca/boton-borrar"
import { BotonOcultar } from "@/app/(app)/biblioteca/boton-ocultar"
import { ListaDeIdeas } from "@/app/(app)/biblioteca/lista-de-ideas"
import { TrasElAviso } from "@/app/(app)/biblioteca/tras-el-aviso"
import { MasOpciones } from "@/components/ui/mas-opciones"
import { ID_DEL_TITULO_DE_LA_LISTA } from "@/lib/dominio/biblioteca/borrado"
import { AVISO_TRAS_MOSTRAR, hrefDeTema } from "@/lib/dominio/biblioteca/filtros-de-temas"
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

  it("lets the toast give the focus back to the list's heading", async () => {
    esConi.valor = true
    datos.resumirAutores.mockResolvedValueOnce([AUTOR])
    const titulo = elementos(await Autores({ searchParams: Promise.resolve({}) })).find((e) => e.type === "h1")
    expect(titulo?.props).toMatchObject({ id: ID_DEL_TITULO_DE_LA_LISTA, tabIndex: -1 })
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
const SUELTA = { id: "i-3", texto: "Una sin tema", tipo: "dato", evidencia: "estudio" }
const OCULTA = { id: "i-2", texto: "Una oculta", tipo: "mito", evidencia: "opinion" }
const MOSTRADA = "77777777-2222-4333-8444-555555555555"
const leido = (tipo: string, cuentas = { materiales: 1, ideas: 2 }) => ({
  autor: { id: ID, nombre: "Daniela Ruiz", credencial: null, tipo, alias: [] },
  ...cuentas,
  grupos: [
    { tema: { id: "t1", nombre: "Carga mental" }, ideas: [IDEA] },
    { tema: null, ideas: [SUELTA] },
  ],
  ocultas: [OCULTA],
})
const LISTA = [
  { id: ID, nombre: "Daniela Ruiz", credencial: null, tipo: "persona", alias: [] },
  { id: OTRO, nombre: "D. Ruiz", credencial: null, tipo: "persona", alias: [] },
]
const conId = (id: string, params: Record<string, string> = {}) => ({
  params: Promise.resolve({ id }),
  searchParams: Promise.resolve(params),
})
/** The text of an element, through its children. */
function texto(nodo: ReactNode): string {
  if (typeof nodo === "string" || typeof nodo === "number") return String(nodo)
  if (Array.isArray(nodo)) return nodo.map(texto).join("")
  if (nodo !== null && typeof nodo === "object" && "props" in nodo) return texto((nodo as Elemento).props.children)
  return ""
}

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

  it("groups its ideas by topic, each title linking to its topic with a full-size target, and the loose ones last", async () => {
    esConi.valor = true
    datos.leerAutor.mockResolvedValueOnce(leido("persona"))
    const arbol = elementos(await DetalleDeAutor(conId(ID)))
    const titulos = arbol.filter((elemento) => elemento.type === "h2")
    expect(titulos.map((titulo) => texto(titulo))).toEqual(["Carga mental", "Sin tema todavía"])
    const enlace = elementos(titulos[0]).find((elemento) => elemento.props.href !== undefined)
    expect(enlace?.props.href).toBe(hrefDeTema("t1"))
    expect(enlace?.props.className).toContain("min-h-objetivo")
    expect(
      arbol.some((elemento) => elemento.type === ListaDeIdeas && elemento.props.etiqueta === "Ideas sin tema todavía"),
    ).toBe(true)
    expect(arbol.some((elemento) => elemento.type === SinMaterial)).toBe(false)
  })

  it("says how to give it material when it has none, instead of zeros", async () => {
    esConi.valor = true
    datos.leerAutor.mockResolvedValueOnce(leido("persona", { materiales: 0, ideas: 0 }))
    expect(elementos(await DetalleDeAutor(conId(ID))).some((elemento) => elemento.type === SinMaterial)).toBe(true)
  })

  it("folds the hidden ideas under «Ideas ocultas (N)», each with Mostrar that comes back with its note", async () => {
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
    expect(boton.props).toEqual({ ideaId: "i-2", oculta: true, despues: `/biblioteca/autores/${ID}?mostrada=i-2` })
    expect(arbol.find((elemento) => elemento.type === AvisoDeIdeas)?.props.texto).toBeNull()
    expect(arbol.some((elemento) => elemento.type === TrasElAviso)).toBe(false)
    const visibles = arbol.find(
      (elemento) => elemento.type === ListaDeIdeas && elemento.props.etiqueta === "Ideas sobre Carga mental",
    )
    expect(visibles?.props.accion).toBeUndefined()
  })

  it("says where a shown idea went, after Mostrar", async () => {
    esConi.valor = true
    datos.leerAutor.mockResolvedValueOnce(leido("persona"))
    const arbol = elementos(await DetalleDeAutor(conId(ID, { mostrada: MOSTRADA })))
    expect(arbol.find((elemento) => elemento.type === AvisoDeIdeas)?.props.texto).toBe(AVISO_TRAS_MOSTRAR)
    expect(arbol.find((elemento) => elemento.type === TrasElAviso)?.props).toEqual({ parametro: "mostrada" })
  })
})

describe("deleting an author", () => {
  const vacio = {
    autor: { id: ID, nombre: "Instituto", credencial: null, tipo: "institucion", alias: [] },
    materiales: 0,
    ideas: 0,
    grupos: [],
    ocultas: [],
  }

  it("offers «Borrar autor» on an author with nothing, last on the page", async () => {
    esConi.valor = true
    datos.leerAutor.mockResolvedValueOnce(vacio)
    const pagina = await DetalleDeAutor(conId(ID))
    const arbol = elementos(pagina)
    expect(arbol.find((e) => e.type === BotonBorrar)?.props).toEqual({ tipo: "autor", id: ID })
    // Last of the page's last part, the side panel on a computer (issue 103).
    const ultimoDe = (nodo: unknown) => {
      const hijos = (nodo as Elemento).props.children
      return (Array.isArray(hijos) ? hijos : [hijos]).filter(Boolean).at(-1)
    }
    const panel = ultimoDe(pagina)
    expect(panel).toEqual(
      expect.objectContaining({ props: expect.objectContaining({ "data-testid": "pagina-panel" }) }),
    )
    expect(ultimoDe(panel)).toEqual(expect.objectContaining({ type: BotonBorrar }))
  })

  it.each([
    ["Coni's own card", { ...vacio, autor: { ...vacio.autor, tipo: "coni" } }],
    ["an author with a material", { ...vacio, materiales: 1 }],
    ["an author with an idea", { ...vacio, ideas: 1 }],
    ["an author with only hidden ideas", { ...vacio, ocultas: [OCULTA] }],
  ])("never offers it on %s", async (_, leidoAhora) => {
    esConi.valor = true
    datos.leerAutor.mockResolvedValueOnce(leidoAhora)
    const arbol = elementos(await DetalleDeAutor(conId(ID)))
    expect(arbol.find((e) => e.type === BotonBorrar)).toBeUndefined()
  })

  it("draws the toast on Autores with the deleted author's name and cleans the address", async () => {
    esConi.valor = true
    datos.leerNombreDeLoBorrado.mockResolvedValueOnce({ nombre: "Instituto" })
    const arbol = elementos(await Autores({ searchParams: Promise.resolve({ aviso: "borrado", id: ID }) }))
    expect(datos.leerNombreDeLoBorrado).toHaveBeenCalledWith(expect.anything(), "autor", ID)
    expect(arbol.find((e) => e.type === AvisoDeBorrado)?.props).toEqual({
      tipo: "autor",
      borrado: { id: ID, nombre: "Instituto" },
    })
    expect(arbol.find((e) => e.type === TrasElAviso)?.props).toEqual({ parametro: "aviso", tambien: "id" })
  })

  it("keeps the toast mounted on Autores without a note, and reads nothing", async () => {
    esConi.valor = true
    const arbol = elementos(await Autores({ searchParams: Promise.resolve({}) }))
    expect(arbol.find((e) => e.type === AvisoDeBorrado)?.props).toEqual({ tipo: "autor", borrado: null })
    expect(arbol.find((e) => e.type === TrasElAviso)).toBeUndefined()
    expect(datos.leerNombreDeLoBorrado).not.toHaveBeenCalled()
  })
})
