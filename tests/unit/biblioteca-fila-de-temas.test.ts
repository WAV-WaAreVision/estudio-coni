import { describe, expect, it } from "vitest"
import {
  alternarSinTratar,
  alternarTratados,
  alternarUnAutor,
  conPilar,
  conRed,
  contarFiltros,
  type FiltrosDeTemas,
  filtrarTemas,
  hayFiltrosDeTemas,
  hrefDeTemas,
  leerFiltrosDeTemas,
  RED_POR_DEFECTO,
} from "@/lib/dominio/biblioteca/fila-de-temas"
import type { TemaResumido } from "@/lib/dominio/biblioteca/temas"
import type { PilarDeRed, Red } from "@/lib/dominio/pilares"

const DE_LINKEDIN = "11111111-2222-4333-8444-555555555555"
const DE_INSTAGRAM = "22222222-2222-4333-8444-555555555555"
const CAPA = "33333333-2222-4333-8444-555555555555"
const TEMA = "44444444-2222-4333-8444-555555555555"
const DESCONOCIDO = "55555555-2222-4333-8444-555555555555"
const PILARES: PilarDeRed[] = [
  { id: DE_LINKEDIN, slug: "diagnostico-doble", nombreCorto: "Diagnóstico doble", red: "linkedin", esCapa: false },
  { id: DE_INSTAGRAM, slug: "mi-nueva-partida", nombreCorto: "Mi nueva partida", red: "instagram", esCapa: false },
  { id: CAPA, slug: "capa-tdah", nombreCorto: "Capa TDAH", red: "instagram", esCapa: true },
]

const leer = (params: Record<string, string>, ultimaRed: Red | null = null) =>
  leerFiltrosDeTemas(params, { pilares: PILARES, ultimaRed })

describe("leerFiltrosDeTemas", () => {
  it("opens on the stored network, LinkedIn when nothing is stored, and the address wins over both", () => {
    expect(RED_POR_DEFECTO).toBe("linkedin")
    expect(leer({})).toEqual({ red: "linkedin" })
    expect(leer({}, "instagram")).toEqual({ red: "instagram" })
    expect(leer({ red: "linkedin" }, "instagram")).toEqual({ red: "linkedin" })
  })

  it("reads an unknown network as absent", () => {
    expect(leer({ red: "youtube" }, "instagram")).toEqual({ red: "instagram" })
    expect(leer({ red: "LinkedIn" })).toEqual({ red: "linkedin" })
  })

  it("keeps a pillar or layer of the chosen network and drops one of the other network, an unknown one or a non-id", () => {
    expect(leer({ red: "instagram", pilar: CAPA })).toEqual({ red: "instagram", pilar: CAPA })
    expect(leer({ red: "instagram", pilar: DE_LINKEDIN })).toEqual({ red: "instagram" })
    expect(leer({ red: "linkedin", pilar: DESCONOCIDO })).toEqual({ red: "linkedin" })
    expect(leer({ red: "linkedin", pilar: "no-es-un-id" })).toEqual({ red: "linkedin" })
  })

  it("gives 15a's ?pilar= without ?red its own network, before the stored one", () => {
    expect(leer({ pilar: DE_INSTAGRAM }, "linkedin")).toEqual({ red: "instagram", pilar: DE_INSTAGRAM })
  })

  it.each([
    ["sin-tratar", { sinTratar: true }],
    ["tratados", { tratados: true }],
    ["un-autor", { unAutor: true }],
  ] as const)("reads ?%s=1 as on and any other value as off", (clave, encendido) => {
    expect(leer({ [clave]: "1" })).toEqual({ red: "linkedin", ...encendido })
    expect(leer({ [clave]: "si" })).toEqual({ red: "linkedin" })
  })

  it.each([
    ["sin-tratar", { sinTratar: true }],
    ["tratados", { tratados: true }],
    ["un-autor", { unAutor: true }],
    ["otra", {}],
  ] as const)("reads batch 3's ?cobertura=%s as its switch", (cobertura, encendido) => {
    expect(leer({ cobertura })).toEqual({ red: "linkedin", ...encendido })
  })

  it("reads «Sin tratar» and «Ya los traté» together as neither: they exclude each other", () => {
    expect(leer({ "sin-tratar": "1", tratados: "1", "un-autor": "1" })).toEqual({ red: "linkedin", unAutor: true })
    expect(leer({ cobertura: "tratados", "sin-tratar": "1" })).toEqual({ red: "linkedin" })
  })

  it("ignores the note and the selection", () => {
    expect(leer({ oculta: TEMA, t: TEMA })).toEqual({ red: "linkedin" })
  })
})

describe("the row's links", () => {
  const base: FiltrosDeTemas = { red: "instagram", pilar: CAPA, unAutor: true }

  it("writes the network first, then the pillar, the switches and the side panel", () => {
    expect(hrefDeTemas({ red: "linkedin" })).toBe("/biblioteca/temas?red=linkedin")
    expect(hrefDeTemas({ red: "instagram", pilar: CAPA, sinTratar: true, unAutor: true }, TEMA)).toBe(
      `/biblioteca/temas?red=instagram&pilar=${CAPA}&sin-tratar=1&un-autor=1&t=${TEMA}`,
    )
    expect(hrefDeTemas({ red: "linkedin", tratados: true })).toBe("/biblioteca/temas?red=linkedin&tratados=1")
  })

  it("«Sin tratar» is one tap on and one tap off, and turning it on clears «Ya los traté»", () => {
    expect(alternarSinTratar({ ...base, tratados: true })).toEqual({ ...base, sinTratar: true })
    expect(alternarSinTratar({ ...base, sinTratar: true })).toEqual(base)
  })

  it("«Ya los traté» clears «Sin tratar», and «Un solo autor» combines with everything", () => {
    expect(alternarTratados({ ...base, sinTratar: true })).toEqual({ ...base, tratados: true })
    expect(alternarTratados({ ...base, tratados: true })).toEqual(base)
    expect(alternarUnAutor({ red: "linkedin", sinTratar: true })).toEqual({
      red: "linkedin",
      sinTratar: true,
      unAutor: true,
    })
    expect(alternarUnAutor(base)).toEqual({ red: "instagram", pilar: CAPA })
  })

  it("another network closes this one's pillars, the chosen one again goes back to every pillar, switches kept", () => {
    expect(conRed(base, "linkedin")).toEqual({ red: "linkedin", unAutor: true })
    expect(conRed(base, "instagram")).toEqual({ red: "instagram", unAutor: true })
  })

  it("a pillar replaces the chosen one and «Todos los pilares» takes it out", () => {
    expect(conPilar(base, DE_INSTAGRAM)).toEqual({ ...base, pilar: DE_INSTAGRAM })
    expect(conPilar(base, undefined)).toEqual({ red: "instagram", unAutor: true })
  })

  it("does not count the network alone as a filter", () => {
    expect(hayFiltrosDeTemas({ red: "instagram" })).toBe(false)
    expect(hayFiltrosDeTemas({ red: "instagram", pilar: CAPA })).toBe(true)
    expect(hayFiltrosDeTemas({ red: "linkedin", sinTratar: true })).toBe(true)
    expect(hayFiltrosDeTemas({ red: "linkedin", unAutor: true })).toBe(true)
  })
})

const tema = (id: string, autores: number, tratado: boolean): TemaResumido => ({
  id,
  nombre: id,
  descripcion: null,
  pilarId: null,
  ideas: autores,
  autores,
  tratado,
})
const TEMAS = [
  tema("tratado", 2, true),
  tema("solo", 1, false),
  tema("solo-tratado", 1, true),
  tema("varios", 3, false),
]

describe("the switches over the topics of the network and pillar", () => {
  it.each([
    [{}, ["tratado", "solo", "solo-tratado", "varios"]],
    [{ sinTratar: true }, ["solo", "varios"]],
    [{ tratados: true }, ["tratado", "solo-tratado"]],
    [{ unAutor: true }, ["solo", "solo-tratado"]],
    [{ sinTratar: true, unAutor: true }, ["solo"]],
  ] as const)("%j keeps %j", (interruptores, ids) => {
    expect(filtrarTemas(TEMAS, { red: "linkedin", ...interruptores }).map((t) => t.id)).toEqual(ids)
  })

  it("counts each switch over the list it gets, whatever is on", () => {
    expect(contarFiltros(TEMAS)).toEqual({ sinTratar: 2, tratados: 2, unAutor: 2 })
    expect(contarFiltros([])).toEqual({ sinTratar: 0, tratados: 0, unAutor: 0 })
  })
})
