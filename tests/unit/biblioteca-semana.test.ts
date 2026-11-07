import { describe, expect, it } from "vitest"
import {
  COSTO_SIN_HISTORIA_USD,
  estimarCostoDelMotor,
  MOTOR_PEDIDO,
  NO_ARRANCO,
  puedePedirMotor,
  RUTA_DE_SEMANA,
  textoDeCosto,
  YA_PROPUSO,
} from "@/lib/dominio/biblioteca/semana"

describe("the cost under «Proponer ahora» (4a)", () => {
  it("is the median of the latest four runs that cost something, to the cent", () => {
    expect(estimarCostoDelMotor([0.2, 0.4, 0.25, 0.3])).toBe(0.28)
    expect(estimarCostoDelMotor([0.21, 0.2, 0.25, 0.3])).toBe(0.23)
  })

  it("looks only at the latest four, newest first", () => {
    expect(estimarCostoDelMotor([0.1, 0.2, 0.3, 0.4, 9])).toBe(0.25)
  })

  it("takes the middle one of fewer than four, or the only one", () => {
    expect(estimarCostoDelMotor([0.31, 0.19, 0.22])).toBe(0.22)
    expect(estimarCostoDelMotor([0.4])).toBe(0.4)
  })

  it("ignores runs that cost nothing", () => {
    expect(estimarCostoDelMotor([0, 0.2, 0])).toBe(0.2)
  })

  it("says a fixed US$ 0,30 before any run cost something", () => {
    expect(COSTO_SIN_HISTORIA_USD).toBe(0.3)
    expect(estimarCostoDelMotor([])).toBe(0.3)
    expect(estimarCostoDelMotor([0, 0])).toBe(0.3)
  })

  it("is said in her words, under the button", () => {
    expect(textoDeCosto(0.25)).toBe("Cuesta cerca de US$ 0,25")
    expect(RUTA_DE_SEMANA).toBe("/biblioteca/semana")
  })
})

describe("puedePedirMotor (spec decision 4)", () => {
  const AHORA = new Date("2026-11-04T15:00:00Z")
  const hace = (minutos: number) => new Date(AHORA.getTime() - minutos * 60_000).toISOString()

  it("lets her ask when this week has no run yet", () => {
    expect(puedePedirMotor(null, AHORA)).toBe(true)
  })

  it("refuses a week that is ready", () => {
    expect(puedePedirMotor({ estado: "lista", creadaEn: hace(600) }, AHORA)).toBe(false)
  })

  it("refuses a run still alive, up to the engine's own 30 minutes, and allows one older than that", () => {
    expect(puedePedirMotor({ estado: "corriendo", creadaEn: hace(29) }, AHORA)).toBe(false)
    expect(puedePedirMotor({ estado: "corriendo", creadaEn: hace(30) }, AHORA)).toBe(false)
    expect(puedePedirMotor({ estado: "corriendo", creadaEn: hace(31) }, AHORA)).toBe(true)
  })

  it("lets her ask again after a failed run", () => {
    expect(puedePedirMotor({ estado: "fallida", creadaEn: hace(5) }, AHORA)).toBe(true)
  })

  it("answers in her words", () => {
    expect(YA_PROPUSO).toBe("El motor ya propuso ideas esta semana. Puedes pedir otras desde el lunes.")
    expect(NO_ARRANCO).toBe("No pude pedirle ideas al motor. Inténtalo de nuevo en unos minutos.")
    expect(MOTOR_PEDIDO).toBe("El motor se puso a trabajar. Las ideas llegan a Ideas en unos minutos.")
  })
})
