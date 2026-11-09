import { describe, expect, it } from "vitest"
import { armarInforme, recortar, textoDelInforme } from "@/lib/dominio/informe-de-modelo"
import {
  type AfirmacionParaPrueba,
  CALIBRACION_INICIAL,
  type TemaParaPrueba,
  type Traslado,
} from "@/lib/dominio/parecido"

function u(componentes: Record<number, number>): number[] {
  const v = Array.from({ length: 8 }, () => 0)
  for (const [i, x] of Object.entries(componentes)) v[Number(i)] = x
  const norma = Math.hypot(...v)
  return v.map((x) => x / norma)
}

const traslado: Traslado = {
  tema: { viejo: 0.8, nuevo: 0.7, fuente: "afirmacion_tema", muestras: 3135 },
  grupo: { viejo: 0.8, nuevo: 0.69, fuente: "afirmacion_afirmacion", muestras: 21736 },
  fusion: { viejo: 0.8, nuevo: 0.9, fuente: "tema_tema", muestras: 105 },
  puenteMin: { viejo: 0.6, nuevo: 0.5, fuente: "tema_tema", muestras: 105 },
  puenteMax: { viejo: 0.8, nuevo: 0.7, fuente: "tema_tema", muestras: 105 },
}

const af = (
  id: string,
  temaId: string | null,
  viejo: number[],
  nuevo: number[],
  texto = `Afirmación ${id}`,
): AfirmacionParaPrueba => ({
  id,
  texto,
  temaId,
  excluida: false,
  viejo,
  nuevo,
})
const tm = (id: string, nombre: string, viejo: number[]): TemaParaPrueba => ({ id, nombre, fusionadoEn: null, viejo })

describe("armarInforme", () => {
  it("lists the merges, the new assignments and the claims whose nearest topic changes", () => {
    const temas = [tm("t1", "Deseo", u({ 0: 1 })), tm("t2", "Ganas", u({ 1: 1 })), tm("t3", "Celos", u({ 4: 1 }))]
    const nuevos = new Map([
      ["t1", u({ 2: 1 })],
      ["t2", u({ 2: 1, 3: 0.1 })],
      ["t3", u({ 5: 1 })],
    ])
    const afirmaciones = [
      af("a1", "t1", u({ 0: 1 }), u({ 5: 1 }), "x".repeat(100)),
      af("a2", null, u({ 6: 1 }), u({ 2: 1 })),
      af("a3", null, u({ 7: 1 }), u({ 7: 1 })),
    ]
    const informe = armarInforme({
      vigente: CALIBRACION_INICIAL,
      modelo: "voyage-4",
      traslado,
      afirmaciones,
      temas,
      nuevos,
      rechazadas: [],
      costoUsd: 0.0011,
    })
    expect(informe.fusiones).toEqual([{ a: "Deseo", b: "Ganas", parecido: expect.closeTo(0.995, 3) }])
    expect(informe.nuevasAsignaciones).toEqual({ total: 1, muestra: [{ texto: "Afirmación a2", tema: "Deseo" }] })
    expect(informe.cambiosDeCercano).toEqual([{ texto: `${"x".repeat(79)}…`, de: "Deseo", a: "Celos" }])
    expect(informe).toMatchObject({
      modelo: "voyage-4",
      modeloAnterior: "voyage-3.5",
      afirmaciones: 3,
      temas: 3,
      temasSinCentroide: [],
    })
  })

  it("leaves out a rejected merge and names a topic without a centroid", () => {
    const temas = [tm("t1", "Deseo", u({ 0: 1 })), tm("t2", "Ganas", u({ 1: 1 }))]
    const informe = armarInforme({
      vigente: CALIBRACION_INICIAL,
      modelo: "voyage-4",
      traslado,
      afirmaciones: [],
      temas,
      nuevos: new Map([["t1", u({ 2: 1 })]]),
      rechazadas: [{ a: "t1", b: "t2" }],
      costoUsd: 0,
    })
    expect(informe.fusiones).toEqual([])
    expect(informe.temasSinCentroide).toEqual(["Ganas"])
  })
})

describe("textoDelInforme", () => {
  it("says everything in Spanish words, with «ninguna» when a list is empty", () => {
    const texto = textoDelInforme({
      modelo: "voyage-4",
      modeloAnterior: "voyage-3.5",
      umbrales: traslado,
      afirmaciones: 209,
      temas: 15,
      temasSinCentroide: [],
      fusiones: [],
      nuevasAsignaciones: { total: 0, muestra: [] },
      cambiosDeCercano: [],
      costoUsd: 0.0011,
    })
    expect(texto).toContain("Prueba de voyage-4 sobre 209 afirmaciones y 15 temas (hoy voyage-3.5).")
    expect(texto).toContain("Tema: 0,80 → 0,70 (3135 pares afirmación-tema)")
    expect(texto).toContain("Ningún par de temas se juntaría.")
    expect(texto).toContain("Ninguna afirmación sin tema encontraría uno.")
    expect(texto).toContain("Ninguna afirmación con tema cambia de tema más cercano.")
    expect(texto).toContain("Costo de la prueba: US$ 0,0011.")
    expect(texto).not.toMatch(/\u2014/)
  })

  it("names merges as «X y Y se juntarían»", () => {
    const texto = textoDelInforme({
      modelo: "voyage-4",
      modeloAnterior: "voyage-3.5",
      umbrales: traslado,
      afirmaciones: 2,
      temas: 2,
      temasSinCentroide: [],
      fusiones: [{ a: "Deseo", b: "Ganas", parecido: 0.91 }],
      nuevasAsignaciones: { total: 1, muestra: [{ texto: "Una idea", tema: "Deseo" }] },
      cambiosDeCercano: [{ texto: "Otra idea", de: "Deseo", a: "Ganas" }],
      costoUsd: 0,
    })
    expect(texto).toContain("- «Deseo» y «Ganas» se juntarían (0,91).")
    expect(texto).toContain("- «Una idea» → Deseo")
    expect(texto).toContain("- «Otra idea»: Deseo → Ganas")
  })
})

describe("recortar", () => {
  it("cuts a text to 80 characters with an ellipsis", () => {
    expect(recortar("corto")).toBe("corto")
    expect(recortar("y".repeat(81))).toHaveLength(80)
  })
})
