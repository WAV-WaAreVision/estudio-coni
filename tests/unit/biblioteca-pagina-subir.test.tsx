// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

// The page gates itself, as Materiales does: a layout does not run again on client navigation.
const { esConi, AUTORES, listarAutores } = vi.hoisted(() => {
  const AUTORES = [{ id: "a-1", nombre: "Daniela Ruiz", credencial: null, tipo: "persona", alias: [] }]
  return { esConi: { valor: false }, AUTORES, listarAutores: vi.fn(async () => AUTORES) }
})
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
vi.mock("@/lib/datos/biblioteca", () => ({ listarAutores }))
// No provider paused: the pages read the open pauses through the same session.
vi.mock("@/lib/datos/pausas", () => ({ leerPausasAbiertas: async () => [] }))
vi.mock("@/app/(app)/biblioteca/acciones", () => ({
  crearMaterialAccion: vi.fn(),
  confirmarMaterialAccion: vi.fn(),
  descartarMaterialAccion: vi.fn(),
  crearAutorAccion: vi.fn(),
}))

import type { ReactElement, ReactNode } from "react"
import { FormularioDeSubida } from "@/app/(app)/biblioteca/subir/formulario-de-subida"
import Subir from "@/app/(app)/biblioteca/subir/page"

type Elemento = ReactElement<{ children?: ReactNode } & Record<string, unknown>>

/** The elements of the page's tree, without rendering it (its children are server and client components). */
function elementos(nodo: ReactNode): Elemento[] {
  if (Array.isArray(nodo)) return nodo.flatMap(elementos)
  if (nodo === null || typeof nodo !== "object" || !("props" in nodo)) return []
  const elemento = nodo as Elemento
  return [elemento, ...elementos(elemento.props.children)]
}

beforeEach(() => vi.clearAllMocks())

describe("the Subir page", () => {
  it("refuses a session that is not Coni's on its own, before reading the authors", async () => {
    esConi.valor = false
    await expect(Subir()).rejects.toThrow("NEXT_NOT_FOUND")
    expect(listarAutores).not.toHaveBeenCalled()
  })

  it("gives the form Coni's authors and the heading, which it puts under its own way back (4e)", async () => {
    esConi.valor = true
    const arbol = elementos(await Subir())
    const formulario = arbol.find((elemento) => elemento.type === FormularioDeSubida)
    expect(formulario?.props.autores).toEqual(AUTORES)
    const encabezado = elementos(formulario?.props.encabezado as ReactNode)
    expect(encabezado.find((elemento) => elemento.type === "h1")?.props.children).toBe("Subir material")
  })

  it("takes the Biblioteca's width on a computer, with no narrower column of its own (the form splits it in two)", async () => {
    esConi.valor = true
    const raiz = (await Subir()) as Elemento
    expect(raiz.props.className).not.toMatch(/max-w-/)
  })
})
