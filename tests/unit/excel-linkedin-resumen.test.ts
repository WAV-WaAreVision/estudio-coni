import { describe, expect, it } from "vitest"
import {
  diaEnPalabras,
  etiquetaDeOpcion,
  resumenDeDudosos,
  resumenDeImportacion,
} from "@/lib/metricas/excel-linkedin/resumen"

const BASE = { guardadas: 3, seguidores: 830, ajenas: 0, faltanEnElPeriodo: 0, llegoAlTope: false, dudosos: 0 }

describe("resumenDeImportacion", () => {
  it("says how many pieces got numbers and the followers saved", () => {
    expect(resumenDeImportacion(BASE)).toEqual([
      "Listo: 3 publicaciones con números.",
      "También guardé tus seguidores: 830.",
    ])
    expect(resumenDeImportacion({ ...BASE, guardadas: 1, seguidores: null })).toEqual([
      "Listo: 1 publicación con números.",
    ])
  })

  it("says how many Excel posts were not from Conidolly and were ignored", () => {
    expect(resumenDeImportacion({ ...BASE, ajenas: 1 })).toContain(
      "Ignoré 1 publicación del Excel que no salió de Conidolly.",
    )
    expect(resumenDeImportacion({ ...BASE, ajenas: 4 })).toContain(
      "Ignoré 4 publicaciones del Excel que no salieron de Conidolly.",
    )
  })

  it("says when the period has no Conidolly posts and only the followers were saved", () => {
    expect(resumenDeImportacion({ ...BASE, guardadas: 0, ajenas: 2 })).toEqual([
      "En ese período no hay publicaciones de Conidolly: guardé solo tus seguidores (830).",
      "Ignoré 2 publicaciones del Excel que no salieron de Conidolly.",
    ])
    expect(resumenDeImportacion({ ...BASE, guardadas: 0, seguidores: null })).toEqual([
      "En ese período no hay publicaciones de Conidolly. No guardé nada.",
    ])
  })

  it("asks for a shorter period only when a list is full and a Conidolly post is missing", () => {
    expect(resumenDeImportacion({ ...BASE, faltanEnElPeriodo: 2, llegoAlTope: true })).toContain(
      "Faltan 2 publicaciones de Conidolly: el Excel trae hasta 50 por lista. Descarga un período más corto (30 o 90 días) y súbelo de nuevo.",
    )
    expect(resumenDeImportacion({ ...BASE, faltanEnElPeriodo: 2, llegoAlTope: false }).join(" ")).not.toMatch(
      /período más corto/,
    )
  })

  it("tells her some hand uploads wait for her pick", () => {
    expect(resumenDeImportacion({ ...BASE, guardadas: 0, seguidores: null, dudosos: 1 })).toEqual([
      "Falta que elijas a qué post del Excel corresponde 1 publicación subida a mano.",
    ])
  })
})

describe("resumenDeDudosos", () => {
  it("counts what her picks saved", () => {
    expect(resumenDeDudosos(1)).toEqual(["Listo: 1 publicación más con números."])
    expect(resumenDeDudosos(2)).toEqual(["Listo: 2 publicaciones más con números."])
  })
})

describe("etiquetaDeOpcion", () => {
  it("names an Excel post by its day and its figures", () => {
    expect(diaEnPalabras("2026-10-07")).toBe("miércoles 7 de octubre")
    expect(etiquetaDeOpcion({ clave: "share:1", fecha: "2026-10-07", impresiones: 2300, interacciones: 40 })).toBe(
      "miércoles 7 de octubre · 2.300 impresiones · 40 interacciones",
    )
    expect(etiquetaDeOpcion({ clave: "share:1", fecha: null, impresiones: null, interacciones: 1 })).toBe(
      "Sin fecha · 1 interacción",
    )
  })
})
