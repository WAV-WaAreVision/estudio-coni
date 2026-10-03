import { describe, expect, it } from "vitest"
import { agruparPorSimilitud, centroideIncremental, coseno, media, parsearVector } from "@/lib/ingesta/agrupar"

const items = [
  { id: "a", vector: [1, 0, 0] },
  { id: "b", vector: [0.99, 0.1, 0] },
  { id: "c", vector: [0, 1, 0] },
  { id: "d", vector: [0, 0.99, 0.1] },
  { id: "e", vector: [0, 0, 1] },
]

describe("coseno", () => {
  it("is 1 for the same direction and 0 for orthogonal vectors, whatever their length", () => {
    expect(coseno([2, 0, 0], [5, 0, 0])).toBeCloseTo(1)
    expect(coseno([1, 0, 0], [0, 3, 0])).toBeCloseTo(0)
  })

  it("is 0 when a vector is all zeros instead of NaN", () => {
    expect(coseno([0, 0, 0], [1, 0, 0])).toBe(0)
  })
})

describe("agruparPorSimilitud", () => {
  it("groups ids whose similarity reaches the threshold and leaves the rest alone", () => {
    expect(agruparPorSimilitud(items, 0.9)).toEqual([["a", "b"], ["c", "d"], ["e"]])
  })

  it("gives the same groups whatever the order of the input", () => {
    expect(agruparPorSimilitud([...items].reverse(), 0.9)).toEqual(agruparPorSimilitud(items, 0.9))
  })

  it("does not chain: a claim must be near the group on average, not near one member", () => {
    const angulo = (grados: number) => [Math.cos((grados * Math.PI) / 180), Math.sin((grados * Math.PI) / 180), 0]
    // A~B and B~C at 0.85, A~C near 0.45.
    const cadena = [
      { id: "a", vector: angulo(0) },
      { id: "b", vector: angulo(31.8) },
      { id: "c", vector: angulo(63.6) },
    ]
    expect(agruparPorSimilitud(cadena, 0.8)).toEqual([["a", "b"], ["c"]])
  })

  it("keeps everything apart when nothing reaches the threshold", () => {
    expect(agruparPorSimilitud(items, 0.999)).toEqual([["a"], ["b"], ["c"], ["d"], ["e"]])
  })

  it("returns no groups for no items", () => {
    expect(agruparPorSimilitud([], 0.8)).toEqual([])
  })
})

describe("average linkage", () => {
  // Unit vectors that share a component `u` and are otherwise orthogonal: every pair has cosine `similitud`.
  function conComun(similitud: number, cuantos: number): number[][] {
    return Array.from({ length: cuantos }, (_, i) => {
      const v = Array.from({ length: cuantos + 1 }, () => 0)
      v[0] = Math.sqrt(similitud)
      v[i + 1] = Math.sqrt(1 - similitud)
      return v
    })
  }

  it("does not let a big random group absorb an unrelated claim", () => {
    // Members are 0.66 apart (random Spanish psychology claims); the outsider is 0.66 from each of them.
    const todos = conComun(0.66, 31)
    const miembros = todos.slice(0, 30)
    const intruso = todos[30] ?? []
    // The old measure: against the normalized centroid the outsider looks like a member.
    const centroideNormalizado = media(miembros)
    expect(coseno(centroideNormalizado, intruso)).toBeGreaterThan(0.8)
    // The mean of cosines is just 0.66.
    const promedio = miembros.reduce((suma, m) => suma + coseno(m, intruso), 0) / miembros.length
    expect(promedio).toBeCloseTo(0.66)
    expect(promedio).toBeLessThan(0.8)
  })

  it("never grows a group of mutually unrelated claims, even when each one is near the leader", () => {
    // Leader w and satellites at 0.81 from w but 0.66 from each other.
    const x = Math.sqrt(0.66)
    const w = [1, ...Array.from({ length: 20 }, () => 0)]
    const satelites = Array.from({ length: 20 }, (_, i) => {
      const v = Array.from({ length: 21 }, () => 0)
      v[0] = x
      v[i + 1] = Math.sqrt(1 - 0.66)
      return { id: `s${String(i).padStart(2, "0")}`, vector: v }
    })
    const grupos = agruparPorSimilitud([{ id: "a", vector: w }, ...satelites], 0.8)
    expect(Math.max(...grupos.map((g) => g.length))).toBeLessThanOrEqual(2)
  })

  it("joins claims that are 0.84 from each member", () => {
    const vectores = conComun(0.84, 12).map((vector, i) => ({ id: `c${String(i).padStart(2, "0")}`, vector }))
    expect(agruparPorSimilitud(vectores, 0.8)).toEqual([vectores.map((v) => v.id)])
  })

  it("scores a claim by the mean cosine to the members even when the vectors are not unit length", () => {
    const grupos = agruparPorSimilitud(
      [
        { id: "a", vector: [10, 0] },
        { id: "b", vector: [0.1, 0.1] },
      ],
      0.8,
    )
    expect(grupos).toEqual([["a"], ["b"]])
  })
})

describe("media", () => {
  it("is the plain mean, not normalized: its length shrinks as the vectors disagree", () => {
    const m = media([
      [1, 0],
      [0, 1],
    ])
    expect(m[0]).toBeCloseTo(0.5)
    expect(m[1]).toBeCloseTo(0.5)
  })

  it("throws with nothing to average", () => {
    expect(() => media([])).toThrow()
  })
})

describe("centroideIncremental", () => {
  it("weights the old mean by the claims it already has: (m*n + v)/(n+1), not normalized", () => {
    const nuevo = centroideIncremental([1, 0], 3, [0, 1])
    expect(nuevo[0]).toBeCloseTo(0.75)
    expect(nuevo[1]).toBeCloseTo(0.25)
  })

  it("matches the plain mean of all the vectors", () => {
    const vectores = [
      [1, 0],
      [0, 1],
      [0.6, 0.8],
    ]
    const incremental = centroideIncremental(media(vectores.slice(0, 2)), 2, vectores[2] ?? [])
    const directo = media(vectores)
    expect(incremental[0]).toBeCloseTo(directo[0] ?? NaN)
    expect(incremental[1]).toBeCloseTo(directo[1] ?? NaN)
  })
})

describe("parsearVector", () => {
  it("reads the text form PostgREST returns for a vector", () => {
    expect(parsearVector("[0.5,-1,2]")).toEqual([0.5, -1, 2])
  })

  it("refuses text that is not a vector", () => {
    expect(() => parsearVector("hola")).toThrow()
  })
})
