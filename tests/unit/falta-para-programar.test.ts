import { describe, expect, it } from "vitest"
import { faltaParaProgramarCarrusel } from "@/app/(app)/guion/[id]/falta-para-programar"

describe("faltaParaProgramarCarrusel", () => {
  it("blocks without a free time, asks to see every slide, then opens", () => {
    expect(faltaParaProgramarCarrusel({ vioTodas: true, hayFecha: false })).toEqual({
      tipo: "bloqueo",
      texto: "No hay un horario libre. Avísale a Federico.",
    })
    expect(faltaParaProgramarCarrusel({ vioTodas: false, hayFecha: true })).toEqual({
      tipo: "falta",
      cosas: ["ver todas las láminas"],
    })
    expect(faltaParaProgramarCarrusel({ vioTodas: true, hayFecha: true })).toEqual({ tipo: "nada" })
  })
})
