// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { AfirmacionLeida, CatalogoDeEtiquetas } from "@/lib/dominio/biblioteca/etiquetas-de-afirmacion"

const { esConi, datos, vocabulario } = vi.hoisted(() => ({
  esConi: { valor: false },
  datos: { leerAfirmacion: vi.fn(async (..._: unknown[]): Promise<AfirmacionLeida | null> => null) },
  vocabulario: { leerCatalogoDeEtiquetas: vi.fn(async (): Promise<CatalogoDeEtiquetas | null> => null) },
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
vi.mock("@/lib/datos/afirmaciones", () => datos)
vi.mock("@/lib/datos/vocabulario", () => vocabulario)
vi.mock("@/app/(app)/biblioteca/acciones", () => ({
  corregirEtiquetaAccion: vi.fn(),
  confirmarEtiquetaAccion: vi.fn(),
  quitarMarcaAccion: vi.fn(),
}))

import type { ReactElement, ReactNode } from "react"
import { CabeceraDeAfirmacion } from "@/app/(app)/biblioteca/afirmaciones/[id]/cabecera-de-afirmacion"
import { EtiquetasDeAfirmacion } from "@/app/(app)/biblioteca/afirmaciones/[id]/etiquetas-de-afirmacion"
import PaginaDeAfirmacion from "@/app/(app)/biblioteca/afirmaciones/[id]/page"
import { Volver } from "@/components/ui/volver"
import { afirmacionDePrueba, CATALOGO_DE_PRUEBA, ID_DE_AFIRMACION, ID_DE_MATERIAL } from "../fixtures/afirmaciones"

type Elemento = ReactElement<Record<string, unknown> & { children?: ReactNode }>

/** The elements of the page's tree, without rendering it (its children are server and client components). */
function elementos(nodo: ReactNode): Elemento[] {
  if (Array.isArray(nodo)) return nodo.flatMap(elementos)
  if (nodo === null || typeof nodo !== "object" || !("props" in nodo)) return []
  const elemento = nodo as Elemento
  return [elemento, ...elementos(elemento.props.children)]
}

const abrir = (id: string, consulta: Record<string, string> = {}) =>
  PaginaDeAfirmacion({ params: Promise.resolve({ id }), searchParams: Promise.resolve(consulta) })

beforeEach(() => {
  vi.clearAllMocks()
  esConi.valor = true
  vocabulario.leerCatalogoDeEtiquetas.mockResolvedValue(CATALOGO_DE_PRUEBA)
})

describe("a claim's page", () => {
  it("refuses a session that is not Coni's before reading anything", async () => {
    esConi.valor = false
    await expect(abrir(ID_DE_AFIRMACION)).rejects.toThrow("NEXT_NOT_FOUND")
    expect(datos.leerAfirmacion).not.toHaveBeenCalled()
  })

  it("is not found for an id that is not a uuid, and for a claim it cannot read (hidden, deleted, missing)", async () => {
    await expect(abrir("x")).rejects.toThrow("NEXT_NOT_FOUND")
    expect(datos.leerAfirmacion).not.toHaveBeenCalled()
    await expect(abrir(ID_DE_AFIRMACION)).rejects.toThrow("NEXT_NOT_FOUND")
    expect(datos.leerAfirmacion).toHaveBeenCalledWith(expect.anything(), ID_DE_AFIRMACION)
  })

  it("gives the header and the tags the claim and the lists, and goes back to its material by default", async () => {
    const afirmacion = afirmacionDePrueba()
    datos.leerAfirmacion.mockResolvedValueOnce(afirmacion)
    const arbol = elementos(await abrir(ID_DE_AFIRMACION))
    expect(arbol.find((e) => e.type === CabeceraDeAfirmacion)?.props.afirmacion).toEqual(afirmacion)
    expect(arbol.find((e) => e.type === EtiquetasDeAfirmacion)?.props).toEqual({
      afirmacion,
      catalogo: CATALOGO_DE_PRUEBA,
    })
    expect(arbol.find((e) => e.type === Volver)?.props).toMatchObject({
      href: `/biblioteca/materiales/${ID_DE_MATERIAL}`,
      children: "Material",
    })
  })

  it("goes back to the author page that opened it", async () => {
    datos.leerAfirmacion.mockResolvedValueOnce(afirmacionDePrueba())
    const desde = "/biblioteca/autores/33333333-4444-4555-8666-777777777777"
    const arbol = elementos(await abrir(ID_DE_AFIRMACION, { desde }))
    expect(arbol.find((e) => e.type === Volver)?.props).toMatchObject({ href: desde, children: "Autor" })
  })
})
