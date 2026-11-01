// @vitest-environment node
import { describe, expect, it } from "vitest"
import {
  discrepanciaDeRegla,
  esReglaDeBorrado,
  REGLAS_DE_BORRADO,
  textoDeDiscrepancia,
} from "@/lib/datos-personales/reglas"

describe("REGLAS_DE_BORRADO", () => {
  it("holds what the app deletes by itself, in days", () => {
    expect(REGLAS_DE_BORRADO).toEqual({ videos_de_piezas: 30, respaldos: 30, huella_de_visitas: 1 })
    expect(esReglaDeBorrado("respaldos")).toBe(true)
    expect(esReglaDeBorrado("comentarios")).toBe(false)
  })
})

describe("discrepanciaDeRegla", () => {
  it("has nothing to say about a row the app does not delete", () => {
    expect(discrepanciaDeRegla({ regla_de_borrado: null, plazo_dias: null })).toBeNull()
  })

  it("has nothing to say when the register says what the code does", () => {
    expect(discrepanciaDeRegla({ regla_de_borrado: "respaldos", plazo_dias: 30 })).toBeNull()
  })

  it("flags a period that differs from the code, giving the code's days", () => {
    expect(discrepanciaDeRegla({ regla_de_borrado: "respaldos", plazo_dias: 90 })).toEqual({
      tipo: "otro_plazo",
      dias: 30,
    })
    expect(discrepanciaDeRegla({ regla_de_borrado: "huella_de_visitas", plazo_dias: null })).toEqual({
      tipo: "otro_plazo",
      dias: 1,
    })
  })

  it("flags a rule the code does not have", () => {
    expect(discrepanciaDeRegla({ regla_de_borrado: "comentarios", plazo_dias: 90 })).toEqual({ tipo: "sin_regla" })
  })
})

describe("textoDeDiscrepancia", () => {
  it("says it in plain words", () => {
    expect(textoDeDiscrepancia({ tipo: "otro_plazo", dias: 30 })).toBe("No coincide con lo que la app borra (30 días)")
    expect(textoDeDiscrepancia({ tipo: "otro_plazo", dias: 1 })).toBe("No coincide con lo que la app borra (1 día)")
    expect(textoDeDiscrepancia({ tipo: "sin_regla" })).toBe(
      "No coincide con lo que la app borra: la app no tiene esa regla",
    )
  })
})
