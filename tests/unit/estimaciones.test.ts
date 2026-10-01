import { describe, expect, it } from "vitest"
import { estimarSegundos, mmss, palabras, pendiente, redondearPar, valorDefinido } from "@/lib/dominio/estimaciones"

describe("estimaciones", () => {
  it("estima sesenta segundos cuando hay ciento cincuenta palabras", () => {
    expect(estimarSegundos("palabra ".repeat(150))).toBeCloseTo(60, 9)
  })

  it("suma una pausa cuando hay una línea en blanco", () => {
    expect(estimarSegundos("uno dos\n\ntres")).toBeCloseTo((3 / 150) * 60 + 0.6, 9)
  })

  it("formatea minutos y segundos cuando pasa del minuto", () => {
    expect(mmss(90)).toBe("1:30")
    expect(mmss(53.4)).toBe("0:53")
  })

  it("redondea los empates al par cuando el valor termina en .5, igual que Python", () => {
    expect(mmss(2.5)).toBe("0:02")
    expect(mmss(3.5)).toBe("0:04")
    expect(redondearPar(112.5)).toBe(112)
    expect(redondearPar(137.5)).toBe(138)
    expect(redondearPar(112.4999)).toBe(112)
  })

  it("coincide con Python cuando el valor es negativo o trae ruido de punto flotante", () => {
    expect(redondearPar(-2.5)).toBe(-2)
    expect(redondearPar(-3.5)).toBe(-4)
    expect(redondearPar(-0.5)).toBeCloseTo(0)
    expect(redondearPar(1.125 * 100)).toBe(112)
    expect(redondearPar(112.4999999999)).toBe(112)
    expect(redondearPar(112.5000000001)).toBe(113)
    expect(redondearPar(2.675 * 100)).toBe(268)
  })

  it("separa palabras como str.split de Python cuando hay espacios, saltos y signos", () => {
    expect(palabras("")).toEqual([])
    expect(palabras("  \n ")).toEqual([])
    expect(palabras("a b\n\n¿Qué?  ¡Sí!")).toEqual(["a", "b", "¿Qué?", "¡Sí!"])
  })

  it("marca pendiente cuando el valor falta o dice pendiente", () => {
    for (const valor of [null, undefined, "", "PENDIENTE"]) {
      expect(pendiente(valor)).toBe(true)
    }
    expect(pendiente("look_123")).toBe(false)
    expect(valorDefinido("PENDIENTE")).toBeNull()
    expect(valorDefinido("look_123")).toBe("look_123")
  })
})
