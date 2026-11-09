import { describe, expect, it } from "vitest"
import {
  type AfirmacionParaPrueba,
  CALIBRACION_INICIAL,
  calcularUmbrales,
  centroidesNuevos,
  MINIMO_DE_MUESTRAS,
  MODELOS_DE_HUELLAS,
  MuestraInsuficiente,
  type Muestras,
  muestrasDeParecido,
  punto,
  type TemaParaPrueba,
  temaMasCercano,
  trasladarPorPercentil,
  umbralesDe,
} from "@/lib/dominio/parecido"

const muestra = [0.31, 0.42, 0.55, 0.61, 0.66, 0.7, 0.74, 0.79, 0.83, 0.9]

describe("trasladarPorPercentil", () => {
  it("keeps the threshold when both models give the same distribution", () => {
    expect(trasladarPorPercentil(muestra, muestra, 0.8)).toBeCloseTo(0.8, 10)
    expect(trasladarPorPercentil(muestra, [...muestra].reverse(), 0.6)).toBeCloseTo(0.6, 10)
  })

  it("moves the threshold by the shift of the distribution", () => {
    const corrida = muestra.map((x) => x - 0.15)
    expect(trasladarPorPercentil(muestra, corrida, 0.8)).toBeCloseTo(0.65, 10)
    expect(trasladarPorPercentil(muestra, corrida, 0.61)).toBeCloseTo(0.46, 10)
  })

  it("reads the new sample at the same fractional rank when the sizes differ", () => {
    expect(trasladarPorPercentil([0, 1], [0, 0.5, 1], 0.25)).toBeCloseTo(0.25, 10)
    expect(trasladarPorPercentil([0, 0.5, 1], [0, 2], 0.75)).toBeCloseTo(1.5, 10)
  })

  it("lands exactly on the matching sample when the threshold is one of the old values", () => {
    expect(trasladarPorPercentil([0.1, 0.2, 0.3], [0.5, 0.6, 0.7], 0.2)).toBeCloseTo(0.6, 10)
  })

  it("keeps its distance to the extreme when the threshold is outside the old range", () => {
    expect(trasladarPorPercentil([0.1, 0.2, 0.3], [0.5, 0.6, 0.7], 0.35)).toBeCloseTo(0.75, 10)
    expect(trasladarPorPercentil([0.1, 0.2, 0.3], [0.5, 0.6, 0.7], 0.05)).toBeCloseTo(0.45, 10)
    expect(trasladarPorPercentil([0.1, 0.2, 0.3], [0.5, 0.6, 0.7], 0.3)).toBeCloseTo(0.7, 10)
  })

  it("needs at least two values on each side", () => {
    expect(() => trasladarPorPercentil([0.5], [0.4, 0.6], 0.5)).toThrow(/dos muestras/)
    expect(() => trasladarPorPercentil([0.4, 0.6], [], 0.5)).toThrow(/dos muestras/)
  })
})

describe("the calibration of voyage-3.5", () => {
  it("is version 1 with the thresholds measured in calibracion-c1.md", () => {
    expect(MODELOS_DE_HUELLAS).toEqual(["voyage-3.5", "voyage-4"])
    expect(CALIBRACION_INICIAL).toEqual({
      version: 1,
      modelo: "voyage-3.5",
      tema: 0.8,
      grupo: 0.8,
      fusion: 0.8,
      puenteMin: 0.6,
      puenteMax: 0.8,
    })
  })
})

/** A unit vector in 8 dimensions with the given components. */
function u(componentes: Record<number, number>): number[] {
  const v = Array.from({ length: 8 }, () => 0)
  for (const [i, x] of Object.entries(componentes)) v[Number(i)] = x
  const norma = Math.hypot(...v)
  return v.map((x) => x / norma)
}

const af = (
  id: string,
  temaId: string | null,
  viejo: number[],
  nuevo: number[],
  excluida = false,
): AfirmacionParaPrueba => ({
  id,
  texto: `Texto ${id}`,
  temaId,
  excluida,
  viejo,
  nuevo,
})
const tm = (id: string, viejo: number[], fusionadoEn: string | null = null): TemaParaPrueba => ({
  id,
  nombre: `Tema ${id}`,
  fusionadoEn,
  viejo,
})

describe("centroidesNuevos", () => {
  it("averages the new vectors of each active topic's claims and gives a merged topic the one it points at", () => {
    const afirmaciones = [af("a", "t1", u({ 0: 1 }), u({ 2: 1 })), af("b", "t1", u({ 0: 1 }), u({ 3: 1 }))]
    const nuevos = centroidesNuevos([tm("t1", u({ 0: 1 })), tm("t2", u({ 0: 1 }), "t1")], afirmaciones)
    const esperado = [0, 0, 0.5, 0.5, 0, 0, 0, 0]
    expect(nuevos.get("t1")).toEqual(esperado)
    expect(nuevos.get("t2")).toEqual(esperado)
  })

  it("has no centroid for an active topic none of whose claims has a vector", () => {
    expect(centroidesNuevos([tm("t1", u({ 0: 1 }))], []).has("t1")).toBe(false)
  })
})

describe("muestrasDeParecido", () => {
  it("pairs claims, claims with active topics, and active topics, under both models, leaving excluded claims out", () => {
    const afirmaciones = [
      af("a", "t1", u({ 0: 1 }), u({ 2: 1 })),
      af("b", null, u({ 0: 1, 1: 1 }), u({ 3: 1 })),
      af("c", null, u({ 5: 1 }), u({ 5: 1 }), true),
    ]
    const temas = [tm("t1", u({ 0: 1 })), tm("t2", u({ 1: 1 })), tm("t3", u({ 0: 1 }), "t1")]
    const nuevos = new Map([
      ["t1", u({ 2: 1 })],
      ["t2", u({ 3: 1 })],
      ["t3", u({ 2: 1 })],
    ])
    const m = muestrasDeParecido(afirmaciones, temas, nuevos)
    expect(m.afirmacion_afirmacion.viejos).toHaveLength(1)
    expect(m.afirmacion_afirmacion.viejos[0]).toBeCloseTo(Math.SQRT1_2)
    expect(m.afirmacion_afirmacion.nuevos[0]).toBeCloseTo(0)
    expect(m.afirmacion_tema.viejos).toHaveLength(4)
    expect(m.tema_tema.viejos).toEqual([0])
    expect(m.tema_tema.nuevos).toEqual([0])
  })
})

/** n values spread evenly over [desde, hasta]. */
const rango = (n: number, desde: number, hasta: number) =>
  Array.from({ length: n }, (_, i) => desde + ((hasta - desde) * i) / (n - 1))

describe("calcularUmbrales", () => {
  const muestras = (aa: number, at: number, tt: number): Muestras => ({
    afirmacion_afirmacion: { viejos: rango(aa, 0.5, 0.9), nuevos: rango(aa, 0.3, 0.7) },
    afirmacion_tema: { viejos: rango(at, 0.5, 0.9), nuevos: rango(at, 0.35, 0.75) },
    tema_tema: { viejos: rango(tt, 0.5, 0.9), nuevos: rango(tt, 0.4, 0.8) },
  })

  it("moves each threshold over its own sample when it has enough values", () => {
    const t = calcularUmbrales(muestras(30, 30, 30), CALIBRACION_INICIAL)
    expect(t.grupo).toEqual({ viejo: 0.8, nuevo: 0.6, fuente: "afirmacion_afirmacion", muestras: 30 })
    expect(t.tema).toEqual({ viejo: 0.8, nuevo: 0.65, fuente: "afirmacion_tema", muestras: 30 })
    expect(t.fusion).toEqual({ viejo: 0.8, nuevo: 0.7, fuente: "tema_tema", muestras: 30 })
    expect(t.puenteMin).toEqual({ viejo: 0.6, nuevo: 0.5, fuente: "tema_tema", muestras: 30 })
    expect(umbralesDe(t)).toEqual({ tema: 0.65, grupo: 0.6, fusion: 0.7, puenteMin: 0.5, puenteMax: 0.7 })
  })

  it("falls back to the claim pairs when topics give fewer than 20 values", () => {
    const t = calcularUmbrales(muestras(30, 19, 3), CALIBRACION_INICIAL)
    expect(t.tema).toEqual({ viejo: 0.8, nuevo: 0.6, fuente: "afirmacion_afirmacion", muestras: 30 })
    expect(t.fusion.fuente).toBe("afirmacion_afirmacion")
    expect(t.puenteMax).toEqual({ viejo: 0.8, nuevo: 0.6, fuente: "afirmacion_afirmacion", muestras: 30 })
  })

  it("refuses to calibrate with fewer than 20 claim pairs", () => {
    expect(MINIMO_DE_MUESTRAS).toBe(20)
    expect(() => calcularUmbrales(muestras(19, 30, 30), CALIBRACION_INICIAL)).toThrow(MuestraInsuficiente)
  })

  it("keeps every threshold between 0 and 1 and rounds it to 4 decimals", () => {
    const bajo: Muestras = {
      afirmacion_afirmacion: { viejos: rango(25, 0.5, 0.9), nuevos: rango(25, -0.5, -0.1) },
      afirmacion_tema: { viejos: [], nuevos: [] },
      tema_tema: { viejos: [], nuevos: [] },
    }
    expect(calcularUmbrales(bajo, CALIBRACION_INICIAL).grupo.nuevo).toBe(0)
    const raro: Muestras = {
      ...bajo,
      afirmacion_afirmacion: { viejos: [0, 1, ...rango(23, 0.1, 0.2)], nuevos: rango(25, 0, 1 / 3) },
    }
    const nuevo = calcularUmbrales(raro, CALIBRACION_INICIAL).grupo.nuevo
    expect(Number(nuevo.toFixed(4))).toBe(nuevo)
  })
})

describe("temaMasCercano", () => {
  it("scores by inner product among the closest topics and needs the threshold, like tema_mas_cercano", () => {
    const centroides = new Map([
      ["t1", u({ 0: 1 })],
      ["t2", u({ 0: 1, 1: 1 }).map((x) => x * 0.5)],
    ])
    expect(temaMasCercano(u({ 0: 1 }), centroides, 0.8)).toEqual({ temaId: "t1", parecido: 1 })
    expect(temaMasCercano(u({ 1: 1 }), centroides, 0.8)).toBeNull()
    expect(temaMasCercano(u({ 1: 1 }), centroides, Number.NEGATIVE_INFINITY)?.temaId).toBe("t2")
  })

  it("is the plain inner product", () => {
    expect(punto([1, 2], [3, 4])).toBe(11)
  })
})
