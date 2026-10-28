import { describe, expect, it } from "vitest"
import { faltaParaProgramarCarrusel } from "@/app/(app)/guion/[id]/falta-para-programar"

describe("faltaParaProgramarCarrusel", () => {
  it("asks to see every slide, then opens", () => {
    expect(faltaParaProgramarCarrusel({ vioTodas: false, hayFecha: true })).toEqual({
      tipo: "falta",
      cosas: ["ver todas las láminas"],
    })
    expect(faltaParaProgramarCarrusel({ vioTodas: true, hayFecha: true })).toEqual({ tipo: "nada" })
  })

  it("asks to choose the date when none is chosen", () => {
    expect(faltaParaProgramarCarrusel({ vioTodas: true, hayFecha: false })).toEqual({
      tipo: "falta",
      cosas: ["elegir la fecha"],
    })
  })

  it("lists the slides first and then the date", () => {
    expect(faltaParaProgramarCarrusel({ vioTodas: false, hayFecha: false })).toEqual({
      tipo: "falta",
      cosas: ["ver todas las láminas", "elegir la fecha"],
    })
  })
})
