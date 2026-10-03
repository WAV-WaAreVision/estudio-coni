import { describe, expect, it } from "vitest"
import {
  agruparPorSimilitud,
  centroideIncremental,
  coseno,
  mediaNormalizada,
  parsearVector,
} from "@/lib/ingesta/agrupar"

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

  it("chains: a claim joins a group through any one of its members (single link)", () => {
    const cadena = [
      { id: "x", vector: [1, 0, 0] },
      { id: "y", vector: [0.8, 0.6, 0] },
      { id: "z", vector: [0.28, 0.96, 0] },
    ]
    expect(agruparPorSimilitud(cadena, 0.79)).toEqual([["x", "y", "z"]])
  })

  it("keeps everything apart when nothing reaches the threshold", () => {
    expect(agruparPorSimilitud(items, 0.999)).toEqual([["a"], ["b"], ["c"], ["d"], ["e"]])
  })

  it("returns no groups for no items", () => {
    expect(agruparPorSimilitud([], 0.8)).toEqual([])
  })
})

describe("mediaNormalizada", () => {
  it("is the mean direction with length 1", () => {
    const media = mediaNormalizada([
      [1, 0],
      [0, 1],
    ])
    expect(media[0]).toBeCloseTo(Math.SQRT1_2)
    expect(media[1]).toBeCloseTo(Math.SQRT1_2)
  })
})

describe("centroideIncremental", () => {
  it("weights the old centroid by the claims it already has: (c*n + v)/(n+1), normalized", () => {
    const nuevo = centroideIncremental([1, 0], 3, [0, 1])
    // (3, 1) / norm
    expect(nuevo[0]).toBeCloseTo(3 / Math.sqrt(10))
    expect(nuevo[1]).toBeCloseTo(1 / Math.sqrt(10))
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
