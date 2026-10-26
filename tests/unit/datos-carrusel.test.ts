import { describe, expect, it } from "vitest"
import { laminasAJson, leerLaminas } from "@/lib/datos/carrusel"
import { LAMINAS_DE_PRUEBA } from "../fixtures/carrusel"

describe("leerLaminas", () => {
  it("reads back what laminasAJson stores", () => {
    expect(leerLaminas(laminasAJson(LAMINAS_DE_PRUEBA))).toEqual(LAMINAS_DE_PRUEBA)
  })

  it("refuses slides that are not a portada, four ideas or more and a closing slide, in that order", () => {
    const [portada, ...resto] = LAMINAS_DE_PRUEBA
    expect(() => leerLaminas(laminasAJson([...resto]))).toThrow("portada, ideas, cierre")
    expect(() => leerLaminas(laminasAJson([portada, ...resto.slice(1)].filter((l) => l !== undefined)))).toThrow()
    expect(() => leerLaminas([{ tipo: "portada" }])).toThrow("formato esperado")
  })
})
