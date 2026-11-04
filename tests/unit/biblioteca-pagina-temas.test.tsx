// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

const { esConi, datos } = vi.hoisted(() => ({
  esConi: { valor: false },
  datos: {
    listarTemas: vi.fn(async (..._: unknown[]): Promise<unknown[]> => []),
    listarPilaresDeTemas: vi.fn(async (): Promise<unknown[]> => []),
    leerTema: vi.fn(async (): Promise<unknown> => null),
    destinoDeTema: vi.fn(async (): Promise<string | null> => null),
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
import { AvisoDeIdeas } from "@/app/(app)/biblioteca/aviso-de-ideas"
import { FiltrosDeCobertura } from "@/app/(app)/biblioteca/temas/filtros-de-cobertura"
import Temas from "@/app/(app)/biblioteca/temas/page"
import { PanelDeTema } from "@/app/(app)/biblioteca/temas/panel-de-tema"
import { TarjetaDeTema } from "@/app/(app)/biblioteca/temas/tarjeta-de-tema"
import { AVISO_TRAS_OCULTAR_LA_ULTIMA } from "@/lib/dominio/biblioteca/filtros-de-temas"

type Elemento = ReactElement<Record<string, unknown> & { children?: ReactNode }>

/** The elements of the page's tree, without rendering it (its children are server and client components). */
function elementos(nodo: ReactNode): Elemento[] {
  if (Array.isArray(nodo)) return nodo.flatMap(elementos)
  if (nodo === null || typeof nodo !== "object" || !("props" in nodo)) return []
  const elemento = nodo as Elemento
  return [elemento, ...elementos(elemento.props.children)]
}

const PILAR = "11111111-2222-4333-8444-555555555555"
const OTRO = "99999999-2222-4333-8444-555555555555"
const CARGA = "22222222-2222-4333-8444-555555555555"
const PAUSAS = "33333333-2222-4333-8444-555555555555"
const IDEA = "44444444-2222-4333-8444-555555555555"
const carga = {
  id: CARGA,
  nombre: "Carga mental",
  descripcion: null,
  pilarId: PILAR,
  ideas: 3,
  autores: 2,
  cubiertoPorConi: true,
}
const pausas = {
  id: PAUSAS,
  nombre: "Pausas",
  descripcion: null,
  pilarId: null,
  ideas: 1,
  autores: 1,
  cubiertoPorConi: false,
}
const conParams = (params: Record<string, string>) => ({ searchParams: Promise.resolve(params) })
const textos = (arbol: Elemento[]) =>
  arbol.map((elemento) => elemento.props.children).filter((c) => typeof c === "string")

beforeEach(() => vi.clearAllMocks())

describe("the Temas page", () => {
  it("refuses a session that is not Coni's on its own, before reading anything", async () => {
    esConi.valor = false
    await expect(Temas(conParams({}))).rejects.toThrow("NEXT_NOT_FOUND")
    expect(datos.listarTemas).not.toHaveBeenCalled()
    expect(datos.listarPilaresDeTemas).not.toHaveBeenCalled()
  })

  it("narrows by an active pillar, and ignores one that is not", async () => {
    esConi.valor = true
    datos.listarPilaresDeTemas.mockResolvedValue([{ id: PILAR, nombre: "IA y salud mental" }])
    await Temas(conParams({ pilar: PILAR }))
    expect(datos.listarTemas).toHaveBeenLastCalledWith(expect.anything(), { pilar: PILAR })
    await Temas(conParams({ pilar: OTRO }))
    expect(datos.listarTemas).toHaveBeenLastCalledWith(expect.anything(), { pilar: undefined })
  })

  it("shows the topics of the coverage chosen, counting the coverages over the pillar's topics", async () => {
    esConi.valor = true
    datos.listarTemas.mockResolvedValueOnce([carga, pausas])
    const arbol = elementos(await Temas(conParams({ cobertura: "tratados" })))
    expect(arbol.find((elemento) => elemento.type === AvisoDeIdeas)?.props.texto).toBeNull()
    const tarjetas = arbol.filter((elemento) => elemento.type === TarjetaDeTema)
    expect(tarjetas.map((tarjeta) => (tarjeta.props.tema as { id: string }).id)).toEqual([CARGA])
    expect(arbol.find((elemento) => elemento.type === FiltrosDeCobertura)?.props.conteos).toEqual({
      "sin-tratar": 1,
      tratados: 1,
      "un-autor": 1,
    })
  })

  it("says why the list is empty, with filters and without", async () => {
    esConi.valor = true
    datos.listarTemas.mockResolvedValueOnce([pausas])
    expect(textos(elementos(await Temas(conParams({ cobertura: "tratados" }))))).toContain(
      "Ningún tema coincide con esos filtros.",
    )
    datos.listarTemas.mockResolvedValueOnce([])
    expect(textos(elementos(await Temas(conParams({}))))).toContain(
      "Los temas aparecen solos cuando varias ideas sacadas hablan de lo mismo. Sube más material de distintos autores.",
    )
  })

  it("says the note after hiding a topic's last idea, and opens the chosen topic in the side panel", async () => {
    esConi.valor = true
    datos.listarTemas.mockResolvedValueOnce([carga])
    const arbol = elementos(await Temas(conParams({ oculta: IDEA, t: CARGA })))
    expect(arbol.find((elemento) => elemento.type === AvisoDeIdeas)?.props.texto).toBe(AVISO_TRAS_OCULTAR_LA_ULTIMA)
    expect(arbol.find((elemento) => elemento.type === PanelDeTema)?.props.tema).toEqual(carga)
  })
})
