import { describe, expect, it } from "vitest"
import { CALIBRACION_INICIAL, MODELOS_DE_HUELLAS, trasladarPorPercentil } from "@/lib/dominio/parecido"

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
