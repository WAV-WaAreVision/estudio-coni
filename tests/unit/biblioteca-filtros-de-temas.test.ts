import { describe, expect, it } from "vitest"
import { leerSeleccion } from "@/lib/dominio/biblioteca/filtros"
import {
  AVISO_TRAS_OCULTAR,
  AVISO_TRAS_OCULTAR_LA_ULTIMA,
  contarCoberturas,
  filtrarPorCobertura,
  hayFiltrosDeTemas,
  hrefDeTema,
  hrefDeTemas,
  hrefTrasOcultar,
  leerFiltrosDeTemas,
  leerIdeaOculta,
} from "@/lib/dominio/biblioteca/filtros-de-temas"
import type { TemaResumido } from "@/lib/dominio/biblioteca/temas"

const PILAR = "11111111-2222-4333-8444-555555555555"
const OTRO = "99999999-2222-4333-8444-555555555555"
const TEMA = "33333333-2222-4333-8444-555555555555"
const IDEA = "44444444-2222-4333-8444-555555555555"

const tema = (id: string, autores: number, cubiertoPorConi: boolean): TemaResumido => ({
  id,
  nombre: id,
  descripcion: null,
  pilarId: null,
  ideas: autores,
  autores,
  cubiertoPorConi,
})
const TEMAS = [
  tema("tratado", 2, true),
  tema("solo", 1, false),
  tema("solo-tratado", 1, true),
  tema("varios", 3, false),
]

describe("leerFiltrosDeTemas", () => {
  it.each([
    ["sin-tratar", "sin-tratar"],
    ["tratados", "tratados"],
    ["un-autor", "un-autor"],
    ["otra", undefined],
  ])("reads cobertura=%s as %s", (valor, cobertura) => {
    expect(leerFiltrosDeTemas({ cobertura: valor }).cobertura).toBe(cobertura)
  })

  it("keeps a pillar only when it is an active one, or any uuid when the list is not given", () => {
    expect(leerFiltrosDeTemas({ pilar: PILAR }, [PILAR])).toEqual({ pilar: PILAR })
    expect(leerFiltrosDeTemas({ pilar: OTRO }, [PILAR])).toEqual({})
    expect(leerFiltrosDeTemas({ pilar: "no-es-un-id" })).toEqual({})
    expect(leerFiltrosDeTemas({ pilar: OTRO })).toEqual({ pilar: OTRO })
  })

  it("ignores the note and the selection", () => {
    expect(leerFiltrosDeTemas({ oculta: IDEA, t: TEMA })).toEqual({})
    expect(hayFiltrosDeTemas({})).toBe(false)
    expect(hayFiltrosDeTemas({ cobertura: "tratados" })).toBe(true)
  })
})

describe("the coverage filter", () => {
  it.each([
    [undefined, ["tratado", "solo", "solo-tratado", "varios"]],
    ["sin-tratar", ["solo", "varios"]],
    ["tratados", ["tratado", "solo-tratado"]],
    ["un-autor", ["solo", "solo-tratado"]],
  ] as const)("%s keeps %j", (cobertura, ids) => {
    expect(filtrarPorCobertura(TEMAS, cobertura).map((t) => t.id)).toEqual(ids)
  })

  it("counts each value over the list it gets, the pillar already applied", () => {
    expect(contarCoberturas(TEMAS)).toEqual({ "sin-tratar": 2, tratados: 2, "un-autor": 2 })
    expect(contarCoberturas([])).toEqual({ "sin-tratar": 0, tratados: 0, "un-autor": 0 })
  })
})

describe("the addresses of Temas", () => {
  it("writes pillar, coverage and the side panel in one order", () => {
    expect(hrefDeTemas({})).toBe("/biblioteca/temas")
    expect(hrefDeTemas({ cobertura: "un-autor", pilar: PILAR }, TEMA)).toBe(
      `/biblioteca/temas?pilar=${PILAR}&cobertura=un-autor&t=${TEMA}`,
    )
    expect(hrefDeTema(TEMA)).toBe(`/biblioteca/temas/${TEMA}`)
  })

  it("after hiding goes to the topic while it keeps ideas, and to the list after its last one (D6)", () => {
    expect(hrefTrasOcultar(TEMA, IDEA, 2)).toBe(`/biblioteca/temas/${TEMA}?oculta=${IDEA}`)
    expect(hrefTrasOcultar(TEMA, IDEA, 1)).toBe(`/biblioteca/temas?oculta=${IDEA}`)
    expect(leerIdeaOculta({ oculta: IDEA })).toBe(IDEA)
    expect(leerIdeaOculta({ oculta: "1" })).toBeNull()
    expect(AVISO_TRAS_OCULTAR).toBe("La oculté. La puedes volver a mostrar desde su autor.")
    expect(AVISO_TRAS_OCULTAR_LA_ULTIMA).toBe(
      "La oculté. Era la última idea de ese tema, así que el tema salió de la lista. La puedes volver a mostrar desde su autor.",
    )
  })
})

describe("leerSeleccion", () => {
  it("reads the side panel of each section by its own key", () => {
    expect(leerSeleccion({ m: TEMA })).toBe(TEMA)
    expect(leerSeleccion({ a: TEMA }, "a")).toBe(TEMA)
    expect(leerSeleccion({ t: "no-es-un-id" }, "t")).toBeNull()
  })
})
