// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { GanchoDeLista, TipoDeGancho } from "@/lib/dominio/biblioteca/ganchos"

const { esConi, datos, vocabulario, biblioteca } = vi.hoisted(() => ({
  esConi: { valor: false },
  datos: {
    listarGanchos: vi.fn(async (): Promise<GanchoDeLista[]> => []),
    leerGancho: vi.fn(async (..._: unknown[]): Promise<GanchoDeLista | null> => null),
    leerTiposPreferidos: vi.fn(async (): Promise<string[]> => []),
  },
  vocabulario: { leerTiposDeGancho: vi.fn(async (): Promise<TipoDeGancho[]> => []) },
  biblioteca: { listarPilaresDeTemas: vi.fn(async (): Promise<unknown[]> => []) },
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
vi.mock("@/lib/datos/ganchos", () => datos)
vi.mock("@/lib/datos/vocabulario", () => vocabulario)
vi.mock("@/lib/datos/biblioteca", () => biblioteca)
vi.mock("@/app/(app)/biblioteca/acciones", () => ({ marcarFavoritoAccion: vi.fn(), guardarMisTiposAccion: vi.fn() }))

import type { ReactElement, ReactNode } from "react"
import PaginaDeGancho from "@/app/(app)/biblioteca/ganchos/[id]/page"
import { DetalleDeGancho } from "@/app/(app)/biblioteca/ganchos/detalle-de-gancho"
import { FiltrosDeGanchos } from "@/app/(app)/biblioteca/ganchos/filtros-de-ganchos"
import { ListaDeGanchos } from "@/app/(app)/biblioteca/ganchos/lista-de-ganchos"
import Ganchos from "@/app/(app)/biblioteca/ganchos/page"
import { PanelDeGancho } from "@/app/(app)/biblioteca/ganchos/panel-de-gancho"
import { SIN_COINCIDENCIAS, SIN_GANCHOS } from "@/lib/dominio/biblioteca/ganchos"
import { ganchoDePrueba, ID_DE_GANCHO, TIPOS_DE_PRUEBA } from "../fixtures/ganchos"

type Elemento = ReactElement<Record<string, unknown> & { children?: ReactNode }>

/** The elements of the page's tree, without rendering it (its children are server and client components). */
function elementos(nodo: ReactNode): Elemento[] {
  if (Array.isArray(nodo)) return nodo.flatMap(elementos)
  if (nodo === null || typeof nodo !== "object" || !("props" in nodo)) return []
  const elemento = nodo as Elemento
  return [elemento, ...elementos(elemento.props.children)]
}

const dice = (arbol: Elemento[], texto: string) => arbol.some((elemento) => elemento.props.children === texto)

const viejo = ganchoDePrueba({
  afirmacionId: "a1b2c3d4-0000-4000-8000-000000000002",
  tipo: "escena",
  creadoEn: "2026-11-01T00:00:00+00:00",
})
const nuevo = ganchoDePrueba({ creadoEn: "2026-11-25T00:00:00+00:00" })

beforeEach(() => {
  vi.clearAllMocks()
  esConi.valor = true
  vocabulario.leerTiposDeGancho.mockResolvedValue(TIPOS_DE_PRUEBA)
})

describe("the Ganchos page", () => {
  it("refuses a session that is not Coni's before reading anything", async () => {
    esConi.valor = false
    await expect(Ganchos({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_NOT_FOUND")
    expect(datos.listarGanchos).not.toHaveBeenCalled()
  })

  it("gives the list the hooks that pass the address's filters, newest first", async () => {
    datos.listarGanchos.mockResolvedValueOnce([viejo, nuevo])
    let arbol = elementos(await Ganchos({ searchParams: Promise.resolve({}) }))
    expect(arbol.find((e) => e.type === ListaDeGanchos)?.props.ganchos).toEqual([nuevo, viejo])
    datos.listarGanchos.mockResolvedValueOnce([viejo, nuevo])
    arbol = elementos(await Ganchos({ searchParams: Promise.resolve({ tipo: "escena" }) }))
    expect(arbol.find((e) => e.type === ListaDeGanchos)?.props.ganchos).toEqual([viejo])
    expect(arbol.find((e) => e.type === FiltrosDeGanchos)?.props.conMisTipos).toBe(false)
  })

  it("offers «Mis tipos» once she has an active type chosen", async () => {
    datos.listarGanchos.mockResolvedValueOnce([nuevo])
    datos.leerTiposPreferidos.mockResolvedValueOnce(["rima", "escena"])
    const arbol = elementos(await Ganchos({ searchParams: Promise.resolve({ "mis-tipos": "1" }) }))
    expect(arbol.find((e) => e.type === FiltrosDeGanchos)?.props.conMisTipos).toBe(true)
    expect(arbol.find((e) => e.type === ListaDeGanchos)).toBeUndefined()
    expect(dice(arbol, SIN_COINCIDENCIAS)).toBe(true)
  })

  it("says how hooks arrive when there are none, without filters", async () => {
    const arbol = elementos(await Ganchos({ searchParams: Promise.resolve({}) }))
    expect(dice(arbol, SIN_GANCHOS)).toBe(true)
    expect(arbol.find((e) => e.type === FiltrosDeGanchos)).toBeUndefined()
  })

  it("opens the chosen hook in the side panel even when the filters hide its row", async () => {
    datos.listarGanchos.mockResolvedValueOnce([viejo, nuevo])
    const arbol = elementos(await Ganchos({ searchParams: Promise.resolve({ tipo: "escena", g: ID_DE_GANCHO }) }))
    expect(arbol.find((e) => e.type === PanelDeGancho)?.props.gancho).toEqual(nuevo)
  })
})

describe("a hook's page", () => {
  it("is not found for an id that is not a uuid or a claim without a hook", async () => {
    await expect(PaginaDeGancho({ params: Promise.resolve({ id: "x" }) })).rejects.toThrow("NEXT_NOT_FOUND")
    await expect(PaginaDeGancho({ params: Promise.resolve({ id: ID_DE_GANCHO }) })).rejects.toThrow("NEXT_NOT_FOUND")
  })

  it("shows the exact phrase as its title and the hook's detail", async () => {
    datos.leerGancho.mockResolvedValueOnce(nuevo)
    const arbol = elementos(await PaginaDeGancho({ params: Promise.resolve({ id: ID_DE_GANCHO }) }))
    expect(arbol.find((e) => e.type === "h1")?.props.children).toBe("«El 70 % no descansa.»")
    expect(arbol.find((e) => e.type === DetalleDeGancho)?.props.gancho).toEqual(nuevo)
    expect(datos.leerGancho).toHaveBeenCalledWith(expect.anything(), ID_DE_GANCHO)
  })
})
