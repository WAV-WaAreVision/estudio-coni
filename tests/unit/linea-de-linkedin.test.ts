import { describe, expect, it } from "vitest"
import {
  detalleDeProgramado,
  lineaDeLinkedin,
  saleSoloEnLinkedin,
  TEXTO_LINKEDIN_A_MANO,
  TEXTO_LINKEDIN_VENCE_ANTES,
  TEXTO_PROGRAMADO_SOLO,
  TEXTO_PROGRAMADO_VENCE_ANTES,
  TEXTO_SALE_SOLO_EN_LINKEDIN,
} from "@/app/(app)/guion/[id]/linea-de-linkedin"
import { TEXTO_PROGRAMADO_CARRUSEL } from "@/app/(app)/guion/[id]/textos"

const EL_JUEVES = "2026-10-29T22:00:00.000Z"

describe("whether a carousel will post by itself at its time", () => {
  it("does while the connection outlives the chosen time", () => {
    expect(saleSoloEnLinkedin("2026-12-06T12:00:00.000Z", EL_JUEVES)).toBe(true)
    expect(lineaDeLinkedin("2026-12-06T12:00:00.000Z", EL_JUEVES)).toBe(TEXTO_SALE_SOLO_EN_LINKEDIN)
    expect(detalleDeProgramado("2026-12-06T12:00:00.000Z", EL_JUEVES)).toBe(TEXTO_PROGRAMADO_SOLO)
  })

  it("says LinkedIn is not connected when there is no connection", () => {
    expect(saleSoloEnLinkedin(null, EL_JUEVES)).toBe(false)
    expect(lineaDeLinkedin(null, EL_JUEVES)).toBe(TEXTO_LINKEDIN_A_MANO)
    expect(detalleDeProgramado(null, EL_JUEVES)).toBe(TEXTO_PROGRAMADO_CARRUSEL)
  })

  it("says the connection expires first when the token ends at or before the chosen time", () => {
    expect(TEXTO_LINKEDIN_VENCE_ANTES).toBe(
      "Tu conexión con LinkedIn vence antes de esa fecha: te lo dejo para subir a mano.",
    )
    expect(lineaDeLinkedin("2026-10-29T21:59:00.000Z", EL_JUEVES)).toBe(TEXTO_LINKEDIN_VENCE_ANTES)
    expect(lineaDeLinkedin(EL_JUEVES, EL_JUEVES)).toBe(TEXTO_LINKEDIN_VENCE_ANTES)
    expect(detalleDeProgramado("2026-10-29T21:59:00.000Z", EL_JUEVES)).toBe(TEXTO_PROGRAMADO_VENCE_ANTES)
    expect(detalleDeProgramado(EL_JUEVES, EL_JUEVES)).toBe(TEXTO_PROGRAMADO_VENCE_ANTES)
  })
})
