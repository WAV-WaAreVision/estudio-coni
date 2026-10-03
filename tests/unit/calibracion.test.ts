import { describe, expect, it } from "vitest"
import {
  contarPor,
  estimarGastoDeCalibracion,
  gruposGrandes,
  muestraAleatoria,
  resumirGrupos,
  tasaDeSupervivencia,
} from "@/lib/ingesta/calibracion"

describe("tasaDeSupervivencia", () => {
  it("is the share of proposed claims whose quote was found verbatim", () => {
    expect(tasaDeSupervivencia(20, 17)).toBeCloseTo(0.85)
  })

  it("is null when Claude proposed nothing, instead of dividing by zero", () => {
    expect(tasaDeSupervivencia(0, 0)).toBeNull()
  })
})

describe("contarPor", () => {
  it("counts items per key, most frequent first", () => {
    const filas = [{ tipo: "dato" }, { tipo: "consejo" }, { tipo: "dato" }]
    expect(contarPor(filas, (f) => f.tipo)).toEqual([
      ["dato", 2],
      ["consejo", 1],
    ])
  })
})

describe("resumirGrupos", () => {
  it("reports the number of groups, singletons, the largest and the groups of 3 or more", () => {
    const resumen = resumirGrupos([["a", "b", "c"], ["d"], ["e", "f"], ["g"]])
    expect(resumen).toEqual({ grupos: 4, soloUnaAfirmacion: 2, mayor: 3, deTresOMas: 1 })
  })

  it("handles no groups", () => {
    expect(resumirGrupos([])).toEqual({ grupos: 0, soloUnaAfirmacion: 0, mayor: 0, deTresOMas: 0 })
  })
})

describe("gruposGrandes", () => {
  it("keeps only groups with at least the minimum size, largest first", () => {
    expect(gruposGrandes([["a"], ["b", "c", "d"], ["e", "f", "g", "h"]], 3)).toEqual([
      ["e", "f", "g", "h"],
      ["b", "c", "d"],
    ])
  })
})

describe("muestraAleatoria", () => {
  const items = [1, 2, 3, 4, 5, 6]

  it("takes n distinct items and leaves the input untouched", () => {
    const muestra = muestraAleatoria(items, 3, () => 0.5)
    expect(muestra).toHaveLength(3)
    expect(new Set(muestra).size).toBe(3)
    expect(items).toEqual([1, 2, 3, 4, 5, 6])
  })

  it("returns everything when n exceeds the length", () => {
    expect(muestraAleatoria(items, 10, () => 0).sort()).toEqual(items)
  })

  it("is deterministic for a given random source", () => {
    expect(muestraAleatoria(items, 3, () => 0.25)).toEqual(muestraAleatoria(items, 3, () => 0.25))
  })
})

describe("estimarGastoDeCalibracion", () => {
  it("adds the chunk requests and the embeddings of the claims they may return", () => {
    const gasto = estimarGastoDeCalibracion({ tramos: 10, usdPorTramo: 0.05, usdEmbeddings: 0.002 })
    expect(gasto).toBeCloseTo(0.502)
  })
})
