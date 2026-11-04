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
import { BotonOcultar } from "@/app/(app)/biblioteca/boton-ocultar"
import { ListaDeIdeas } from "@/app/(app)/biblioteca/lista-de-ideas"
import DetalleDeTema from "@/app/(app)/biblioteca/temas/[id]/page"
import { FiltrosDeCobertura } from "@/app/(app)/biblioteca/temas/filtros-de-cobertura"
import Temas from "@/app/(app)/biblioteca/temas/page"
import { PanelDeTema } from "@/app/(app)/biblioteca/temas/panel-de-tema"
import { TarjetaDeTema } from "@/app/(app)/biblioteca/temas/tarjeta-de-tema"
import { TrasElAviso } from "@/app/(app)/biblioteca/tras-el-aviso"
import { hrefDeAutor } from "@/lib/dominio/biblioteca/autores"
import { AVISO_TRAS_OCULTAR, AVISO_TRAS_OCULTAR_LA_ULTIMA } from "@/lib/dominio/biblioteca/filtros-de-temas"
import type { IdeaLeida } from "@/lib/dominio/biblioteca/ideas"

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
    // A new page: the focus the button gave the old note is gone, so the note takes it on arrival.
    expect(arbol.find((elemento) => elemento.type === TrasElAviso)?.props).toEqual({ parametro: "oculta" })
    expect(arbol.find((elemento) => elemento.type === PanelDeTema)?.props.tema).toEqual(carga)
  })

  it("has nothing to do after the note when there is none", async () => {
    esConi.valor = true
    datos.listarTemas.mockResolvedValueOnce([carga])
    expect(elementos(await Temas(conParams({}))).some((elemento) => elemento.type === TrasElAviso)).toBe(false)
  })
})

const UNA = { id: "i-1", texto: "Una", tipo: "dato", evidencia: "estudio" }
const DOS = { id: "i-2", texto: "Dos", tipo: "dato", evidencia: "estudio" }
const leido = (ideas: IdeaLeida[]) => ({
  tema: { id: CARGA, nombre: "Carga mental", descripcion: "El peso de lo que nadie ve." },
  ideas: ideas.length,
  autores: [{ autor: { id: "a-1", nombre: "Daniela Ruiz", credencial: null }, ideas }],
})
const abrir = (id: string, params: Record<string, string> = {}) =>
  DetalleDeTema({ params: Promise.resolve({ id }), searchParams: Promise.resolve(params) })

describe("a topic's page", () => {
  it("refuses what is not an id before reading", async () => {
    esConi.valor = true
    await expect(abrir("no-es-un-id")).rejects.toThrow("NEXT_NOT_FOUND")
    expect(datos.destinoDeTema).not.toHaveBeenCalled()
  })

  it("sends a merged topic's address to the one that stayed", async () => {
    esConi.valor = true
    datos.destinoDeTema.mockResolvedValueOnce(CARGA)
    await expect(abrir(PAUSAS)).rejects.toThrow(`NEXT_REDIRECT /biblioteca/temas/${CARGA}`)
    expect(datos.leerTema).not.toHaveBeenCalled()
  })

  it("is not found for a missing topic, a loop, or one gone meanwhile", async () => {
    esConi.valor = true
    datos.destinoDeTema.mockResolvedValueOnce(null)
    await expect(abrir(CARGA)).rejects.toThrow("NEXT_NOT_FOUND")
    datos.destinoDeTema.mockResolvedValueOnce(CARGA)
    datos.leerTema.mockResolvedValueOnce(null)
    await expect(abrir(CARGA)).rejects.toThrow("NEXT_NOT_FOUND")
  })

  it("after hiding, lands on the list with its note when the topic is gone meanwhile instead of not found", async () => {
    esConi.valor = true
    datos.destinoDeTema.mockResolvedValueOnce(null)
    await expect(abrir(CARGA, { oculta: PAUSAS })).rejects.toThrow(`NEXT_REDIRECT /biblioteca/temas?oculta=${PAUSAS}`)
    datos.destinoDeTema.mockResolvedValueOnce(null)
    await expect(abrir(CARGA, { oculta: "no-es-un-id" })).rejects.toThrow("NEXT_NOT_FOUND")
  })

  it("groups its ideas by author, each title linking to the author with a full-size target", async () => {
    esConi.valor = true
    datos.destinoDeTema.mockResolvedValue(CARGA)
    datos.leerTema.mockResolvedValueOnce(leido([UNA]))
    const titulo = elementos(await abrir(CARGA)).find((elemento) => elemento.type === "h2")
    const enlace = elementos(titulo).find((elemento) => elemento.props.href !== undefined)
    expect(enlace?.props.href).toBe(hrefDeAutor("a-1"))
    expect(enlace?.props.children).toBe("Daniela Ruiz")
    expect(enlace?.props.className).toContain("min-h-objetivo")
  })

  it("gives each idea Ocultar, going to the topic while it keeps ideas and to the list after the last (D6)", async () => {
    esConi.valor = true
    datos.destinoDeTema.mockResolvedValue(CARGA)
    datos.leerTema.mockResolvedValueOnce(leido([UNA, DOS]))
    const lista = elementos(await abrir(CARGA)).find((elemento) => elemento.type === ListaDeIdeas)
    expect(lista?.props.etiqueta).toBe("Ideas de Daniela Ruiz")
    const boton = (lista?.props.accion as (idea: IdeaLeida) => Elemento)(UNA)
    expect(boton.type).toBe(BotonOcultar)
    expect(boton.props).toEqual({ ideaId: "i-1", oculta: false, despues: `/biblioteca/temas/${CARGA}?oculta=i-1` })

    datos.leerTema.mockResolvedValueOnce(leido([UNA]))
    const sola = elementos(await abrir(CARGA)).find((elemento) => elemento.type === ListaDeIdeas)
    expect((sola?.props.accion as (idea: IdeaLeida) => Elemento)(UNA).props.despues).toBe(
      "/biblioteca/temas?oculta=i-1",
    )
  })

  it("says the quiet note after hiding", async () => {
    esConi.valor = true
    datos.destinoDeTema.mockResolvedValue(CARGA)
    datos.leerTema.mockResolvedValueOnce(leido([UNA]))
    expect(elementos(await abrir(CARGA)).find((elemento) => elemento.type === AvisoDeIdeas)?.props.texto).toBeNull()
    datos.leerTema.mockResolvedValueOnce(leido([UNA]))
    expect(elementos(await abrir(CARGA)).some((elemento) => elemento.type === TrasElAviso)).toBe(false)
    datos.leerTema.mockResolvedValueOnce(leido([UNA]))
    const arbol = elementos(await abrir(CARGA, { oculta: IDEA }))
    expect(arbol.find((elemento) => elemento.type === AvisoDeIdeas)?.props.texto).toBe(AVISO_TRAS_OCULTAR)
    expect(arbol.find((elemento) => elemento.type === TrasElAviso)?.props).toEqual({ parametro: "oculta" })
  })
})
