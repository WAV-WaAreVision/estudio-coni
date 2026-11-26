import { describe, expect, it } from "vitest"
import {
  alternarFavoritos,
  alternarMisTipos,
  conPilar,
  conRed,
  type FiltrosDeGanchos,
  filtrarGanchos,
  filtrosDeParametros,
  filtrosPlegados,
  hayFiltrosDeGanchos,
  hrefDeGancho,
  hrefDeGanchos,
  leerFiltrosDeGanchos,
  sinPlegados,
} from "@/lib/dominio/biblioteca/filtros-de-ganchos"
import type { PilarDeRed } from "@/lib/dominio/pilares"
import { ganchoDePrueba, PILAR_DE_INSTAGRAM, PILAR_DE_LINKEDIN, TIPOS_DE_PRUEBA } from "../fixtures/ganchos"

const TEMA = "44444444-5555-4666-8777-888888888888"
const AUTOR = "33333333-4444-4555-8666-777777777777"
const OTRO_AUTOR = "88888888-9999-4aaa-8bbb-cccccccccccc"
const CAPA = "77777777-8888-4999-8aaa-bbbbbbbbbbbb"
const GANCHO = "11111111-2222-4333-8444-555555555555"

const PILARES: PilarDeRed[] = [
  {
    id: PILAR_DE_LINKEDIN,
    slug: "bienestar-e-impacto",
    nombreCorto: "Bienestar e impacto",
    red: "linkedin",
    esCapa: false,
  },
  {
    id: PILAR_DE_INSTAGRAM,
    slug: "mi-nueva-partida",
    nombreCorto: "Mi nueva partida",
    red: "instagram",
    esCapa: false,
  },
  { id: CAPA, slug: "capa-tdah", nombreCorto: "Capa TDAH", red: "linkedin", esCapa: true },
]
const CONTEXTO = { tipos: TIPOS_DE_PRUEBA, pilares: PILARES, misTipos: ["escena"] }

describe("leerFiltrosDeGanchos", () => {
  it("reads every valid filter of the address", () => {
    expect(
      leerFiltrosDeGanchos(
        {
          tipo: "escena",
          red: "linkedin",
          pilar: PILAR_DE_LINKEDIN,
          tema: TEMA,
          autor: AUTOR,
          favoritos: "1",
          "mis-tipos": "1",
        },
        CONTEXTO,
      ),
    ).toEqual({
      tipo: "escena",
      red: "linkedin",
      pilar: PILAR_DE_LINKEDIN,
      tema: TEMA,
      autor: AUTOR,
      favoritos: true,
      misTipos: true,
    })
  })

  it("reads «Sin clasificar» and «Sin red», and ignores what is not valid, never failing", () => {
    expect(leerFiltrosDeGanchos({ tipo: "sin_clasificar", red: "sin_red" }, CONTEXTO)).toEqual({
      tipo: "sin_clasificar",
      red: "sin_red",
    })
    expect(
      leerFiltrosDeGanchos(
        { tipo: "rima", red: "tiktok", tema: "x", autor: ["no-es-uuid"], favoritos: "si", otro: "1" },
        CONTEXTO,
      ),
    ).toEqual({})
    expect(leerFiltrosDeGanchos({ tipo: "inventado" }, CONTEXTO)).toEqual({})
  })

  it("keeps a pillar only after its own network, and never a layer", () => {
    expect(leerFiltrosDeGanchos({ pilar: PILAR_DE_LINKEDIN }, CONTEXTO)).toEqual({})
    expect(leerFiltrosDeGanchos({ red: "instagram", pilar: PILAR_DE_LINKEDIN }, CONTEXTO)).toEqual({ red: "instagram" })
    expect(leerFiltrosDeGanchos({ red: "sin_red", pilar: PILAR_DE_LINKEDIN }, CONTEXTO)).toEqual({ red: "sin_red" })
    expect(leerFiltrosDeGanchos({ red: "linkedin", pilar: CAPA }, CONTEXTO)).toEqual({ red: "linkedin" })
  })

  it("drops «Mis tipos» while she has no active type chosen", () => {
    expect(leerFiltrosDeGanchos({ "mis-tipos": "1" }, { ...CONTEXTO, misTipos: [] })).toEqual({})
  })
})

describe("filtrosDeParametros", () => {
  it("reads the form's fields without the lists, dropping the empty selects", () => {
    expect(
      filtrosDeParametros({
        tipo: "",
        tema: "",
        autor: AUTOR,
        red: "linkedin",
        pilar: PILAR_DE_LINKEDIN,
        favoritos: "1",
      }),
    ).toEqual({ autor: AUTOR, red: "linkedin", pilar: PILAR_DE_LINKEDIN, favoritos: true })
  })
})

describe("hrefDeGanchos", () => {
  it("writes the filters in one order, then the open hook", () => {
    const filtros: FiltrosDeGanchos = {
      autor: AUTOR,
      misTipos: true,
      tipo: "escena",
      favoritos: true,
      pilar: PILAR_DE_LINKEDIN,
      red: "linkedin",
      tema: TEMA,
    }
    expect(hrefDeGanchos(filtros, GANCHO)).toBe(
      `/biblioteca/ganchos?tipo=escena&red=linkedin&pilar=${PILAR_DE_LINKEDIN}&tema=${TEMA}&autor=${AUTOR}&favoritos=1&mis-tipos=1&g=${GANCHO}`,
    )
  })

  it("is the bare route without filters, and a hook's page is its id", () => {
    expect(hrefDeGanchos({})).toBe("/biblioteca/ganchos")
    expect(hrefDeGancho(GANCHO)).toBe(`/biblioteca/ganchos/${GANCHO}`)
  })

  it("carries the filters into a hook's page, so its way back keeps them", () => {
    expect(hrefDeGancho(GANCHO, { red: "linkedin", favoritos: true })).toBe(
      `/biblioteca/ganchos/${GANCHO}?red=linkedin&favoritos=1`,
    )
  })

  it("round-trips through the address", () => {
    const filtros: FiltrosDeGanchos = { tipo: "escena", red: "linkedin", pilar: PILAR_DE_LINKEDIN, misTipos: true }
    const url = new URL(hrefDeGanchos(filtros), "http://localhost")
    expect(leerFiltrosDeGanchos(Object.fromEntries(url.searchParams), CONTEXTO)).toEqual(filtros)
  })
})

describe("the network and pillar cascade", () => {
  it("drops the pillar when the network changes or goes", () => {
    expect(conRed({ red: "linkedin", pilar: PILAR_DE_LINKEDIN, tipo: "escena" }, "instagram")).toEqual({
      red: "instagram",
      tipo: "escena",
    })
    expect(conRed({ red: "linkedin", pilar: PILAR_DE_LINKEDIN }, undefined)).toEqual({})
  })

  it("sets or clears the pillar and keeps the rest", () => {
    expect(conPilar({ red: "linkedin" }, PILAR_DE_LINKEDIN)).toEqual({ red: "linkedin", pilar: PILAR_DE_LINKEDIN })
    expect(conPilar({ red: "linkedin", pilar: PILAR_DE_LINKEDIN }, undefined)).toEqual({ red: "linkedin" })
  })
})

describe("switches and folded filters", () => {
  it("turns favorites and her types on and off", () => {
    expect(alternarFavoritos({ red: "linkedin" })).toEqual({ red: "linkedin", favoritos: true })
    expect(alternarFavoritos({ favoritos: true })).toEqual({})
    expect(alternarMisTipos({})).toEqual({ misTipos: true })
    expect(alternarMisTipos({ misTipos: true, tipo: "escena" })).toEqual({ tipo: "escena" })
  })

  it("counts and clears the filters folded under «Más filtros»", () => {
    const filtros: FiltrosDeGanchos = { tipo: "escena", tema: TEMA, autor: AUTOR, red: "linkedin", favoritos: true }
    expect(filtrosPlegados(filtros)).toBe(3)
    expect(sinPlegados(filtros)).toEqual({ red: "linkedin", favoritos: true })
    expect(hayFiltrosDeGanchos({})).toBe(false)
    expect(hayFiltrosDeGanchos({ favoritos: true })).toBe(true)
  })
})

describe("filtrarGanchos", () => {
  const pilarDeLinkedin = { red: "linkedin" as const, pilarId: PILAR_DE_LINKEDIN, nombre: "Bienestar e impacto" }
  const pilarDeInstagram = { red: "instagram" as const, pilarId: PILAR_DE_INSTAGRAM, nombre: "Mi nueva partida" }
  const linkedin = ganchoDePrueba({ afirmacionId: "a", tipo: "escena" })
  const instagram = ganchoDePrueba({
    afirmacionId: "b",
    tipo: "mito",
    pilares: [pilarDeInstagram],
    favorito: true,
    autor: { id: OTRO_AUTOR, nombre: "Otra" },
    tema: null,
  })
  const ambas = ganchoDePrueba({ afirmacionId: "c", pilares: [pilarDeLinkedin, pilarDeInstagram] })
  const sinRed = ganchoDePrueba({ afirmacionId: "d", tipo: "sin_clasificar", clasificado: false, pilares: [] })
  const todos = [linkedin, instagram, ambas, sinRed]
  const ids = (filtros: FiltrosDeGanchos, misTipos: string[] = []) =>
    filtrarGanchos(todos, filtros, misTipos).map((gancho) => gancho.afirmacionId)

  it("keeps everything without filters", () => {
    expect(ids({})).toEqual(["a", "b", "c", "d"])
  })

  it("filters by type, «Sin clasificar» included", () => {
    expect(ids({ tipo: "escena" })).toEqual(["a"])
    expect(ids({ tipo: "sin_clasificar" })).toEqual(["d"])
  })

  it("filters by network, a hook on both networks counting for each, and by «Sin red»", () => {
    expect(ids({ red: "linkedin" })).toEqual(["a", "c"])
    expect(ids({ red: "instagram" })).toEqual(["b", "c"])
    expect(ids({ red: "sin_red" })).toEqual(["d"])
  })

  it("filters by pillar, topic, author, favorites and her types", () => {
    expect(ids({ red: "instagram", pilar: PILAR_DE_INSTAGRAM })).toEqual(["b", "c"])
    expect(ids({ tema: TEMA })).toEqual(["a", "c", "d"])
    expect(ids({ autor: OTRO_AUTOR })).toEqual(["b"])
    expect(ids({ favoritos: true })).toEqual(["b"])
    expect(ids({ misTipos: true }, ["mito", "escena"])).toEqual(["a", "b"])
  })
})
