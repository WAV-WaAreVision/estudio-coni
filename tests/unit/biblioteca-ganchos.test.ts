import { describe, expect, it } from "vitest"
import {
  etiquetaDeTipo,
  opcionesDeFiltros,
  ordenarGanchos,
  tiposDeGancho,
  tiposDeGanchoValidos,
  tiposPreferidosActivos,
} from "@/lib/dominio/biblioteca/ganchos"
import { ganchoDePrueba, TIPOS_DE_PRUEBA } from "../fixtures/ganchos"
import { VOCABULARIO_DE_PRUEBA } from "../fixtures/vocabulario"

describe("tiposDeGancho", () => {
  it("keeps every stored value with its label, a retired one as inactive", () => {
    expect(
      tiposDeGancho([
        { valor: "escena", etiqueta: "Escena" },
        { valor: "rima", etiqueta: "Rima", retirado: true },
      ]),
    ).toEqual([
      { valor: "escena", etiqueta: "Escena", activo: true },
      { valor: "rima", etiqueta: "Rima", activo: false },
    ])
  })
})

describe("etiquetaDeTipo", () => {
  it("labels list values from the vocabulary, retired ones included", () => {
    expect(etiquetaDeTipo(TIPOS_DE_PRUEBA, "antes_ahora")).toBe("Antes/ahora")
    expect(etiquetaDeTipo(TIPOS_DE_PRUEBA, "rima")).toBe("Rima")
  })

  it("names the two values that are not list values, and a value the list no longer has", () => {
    expect(etiquetaDeTipo(TIPOS_DE_PRUEBA, "sin_clasificar")).toBe("Sin clasificar")
    expect(etiquetaDeTipo(TIPOS_DE_PRUEBA, "ninguno")).toBe("Ninguno de la lista")
    expect(etiquetaDeTipo(TIPOS_DE_PRUEBA, "borrado_del_todo")).toBe("Un tipo que ya no está en la lista")
  })
})

describe("preferred types", () => {
  it("uses only the chosen types that are still active in the list", () => {
    expect(tiposPreferidosActivos(["rima", "escena", "inventado"], TIPOS_DE_PRUEBA)).toEqual(["escena"])
  })

  it("keeps only vigente values when saving, once each and in the list's order", () => {
    expect(tiposDeGanchoValidos(VOCABULARIO_DE_PRUEBA, ["mito", "inventado", "escena", "mito"])).toEqual([
      "escena",
      "mito",
    ])
    expect(tiposDeGanchoValidos(VOCABULARIO_DE_PRUEBA, [])).toEqual([])
  })
})

describe("ordenarGanchos", () => {
  it("puts favorites first, then the newest, then by id", () => {
    const viejo = ganchoDePrueba({ afirmacionId: "a", creadoEn: "2026-11-20T10:00:00+00:00" })
    const favorito = ganchoDePrueba({ afirmacionId: "b", creadoEn: "2026-11-19T08:00:00+00:00", favorito: true })
    const nuevo = ganchoDePrueba({ afirmacionId: "c", creadoEn: "2026-11-21T12:00:00+00:00" })
    const empate = ganchoDePrueba({ afirmacionId: "0", creadoEn: "2026-11-20T10:00:00+00:00" })
    expect(ordenarGanchos([viejo, favorito, nuevo, empate]).map((g) => g.afirmacionId)).toEqual(["b", "c", "0", "a"])
  })
})

describe("opcionesDeFiltros", () => {
  it("offers the authors and topics that have hooks, once each, in Spanish order", () => {
    const opciones = opcionesDeFiltros([
      ganchoDePrueba({ autor: { id: "x", nombre: "Óscar" }, tema: { id: "t2", nombre: "Sueño" } }),
      ganchoDePrueba({ autor: { id: "y", nombre: "Ana" }, tema: { id: "t1", nombre: "Ansiedad" } }),
      ganchoDePrueba({ autor: { id: "x", nombre: "Óscar" }, tema: null }),
      ganchoDePrueba({ autor: null, tema: { id: "t1", nombre: "Ansiedad" } }),
    ])
    expect(opciones).toEqual({
      autores: [
        { id: "y", nombre: "Ana" },
        { id: "x", nombre: "Óscar" },
      ],
      temas: [
        { id: "t1", nombre: "Ansiedad" },
        { id: "t2", nombre: "Sueño" },
      ],
    })
  })
})
