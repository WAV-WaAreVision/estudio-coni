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
vi.mock("@/app/(app)/biblioteca/acciones", () => ({
  crearMaterialAccion: vi.fn(),
  confirmarMaterialAccion: vi.fn(),
  descartarMaterialAccion: vi.fn(),
  crearAutorAccion: vi.fn(),
}))

import type { ReactElement, ReactNode } from "react"
import { FormularioDeSubida } from "@/app/(app)/biblioteca/subir/formulario-de-subida"
import Subir from "@/app/(app)/biblioteca/subir/page"
import { Volver } from "@/components/ui/volver"

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

  it("gives Coni the way back on the left, the heading and the form with her authors (4e)", async () => {
    esConi.valor = true
    const arbol = elementos(await Subir())
    const volver = arbol.find((elemento) => elemento.type === Volver)
    expect(volver?.props.href).toBe("/biblioteca")
    expect(volver?.props.children).toBe("Volver a Biblioteca")
    expect(arbol.find((elemento) => elemento.type === "h1")?.props.children).toBe("Subir material")
    expect(arbol.find((elemento) => elemento.type === FormularioDeSubida)?.props.autores).toEqual(AUTORES)
  })

  it("reads in one column on a computer, as wide as a material's detail", async () => {
    esConi.valor = true
    const raiz = (await Subir()) as Elemento
    expect(raiz.props.className).toContain("md:max-w-[42rem]")
  })
})
