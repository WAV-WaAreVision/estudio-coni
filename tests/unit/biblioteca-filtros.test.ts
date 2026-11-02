import { describe, expect, it } from "vitest"
import {
  hayFiltros,
  hayFiltrosPlegados,
  hrefDeLista,
  leerFiltros,
  leerSeleccion,
} from "@/lib/dominio/biblioteca/filtros"

const AUTOR = "6f1d6c2e-8f43-4a8e-9a3f-2b1c7a0d9e55"
const MATERIAL = "11111111-2222-4333-8444-555555555555"

describe("leerFiltros", () => {
  it("reads the valid filters of the URL and ignores everything else, never failing", () => {
    expect(leerFiltros({ autor: AUTOR, rol: "referente", tipo: "audio", estado: "fallido" })).toEqual({
      autor: AUTOR,
      rol: "referente",
      tipo: "audio",
      estado: "fallido",
    })
    expect(leerFiltros({ autor: "x", rol: "coni", tipo: "", estado: ["listo", "fallido"], otro: "1" })).toEqual({
      estado: "listo",
    })
  })

  it("tells any filter from the folded ones", () => {
    expect(hayFiltros({})).toBe(false)
    expect(hayFiltros({ estado: "listo" })).toBe(true)
    expect(hayFiltrosPlegados({ estado: "listo" })).toBe(false)
    expect(hayFiltrosPlegados({ estado: "listo", tipo: "audio" })).toBe(true)
  })
})

describe("leerSeleccion", () => {
  it("is the material of ?m, or null when it is not an id", () => {
    expect(leerSeleccion({ m: MATERIAL })).toBe(MATERIAL)
    expect(leerSeleccion({ m: "../x" })).toBeNull()
    expect(leerSeleccion({})).toBeNull()
  })
})

describe("hrefDeLista", () => {
  it("writes the filters in a fixed order, and the selected material last", () => {
    expect(hrefDeLista({})).toBe("/biblioteca")
    expect(hrefDeLista({ estado: "procesando", autor: AUTOR })).toBe(`/biblioteca?autor=${AUTOR}&estado=procesando`)
    expect(hrefDeLista({ estado: "listo" }, MATERIAL)).toBe(`/biblioteca?estado=listo&m=${MATERIAL}`)
  })

  it("drops a filter set to nothing", () => {
    expect(hrefDeLista({ estado: undefined, tipo: "video" })).toBe("/biblioteca?tipo=video")
  })
})
