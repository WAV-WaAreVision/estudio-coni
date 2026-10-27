import { describe, expect, it } from "vitest"
import {
  detalleDeProgramado,
  lineaDeLinkedin,
  saleSoloEnLinkedin,
  TEXTO_LINKEDIN_A_MANO,
  TEXTO_PROGRAMADO_SOLO,
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

  it("does not without a connection, or when the token will have expired by then", () => {
    expect(lineaDeLinkedin(null, EL_JUEVES)).toBe(TEXTO_LINKEDIN_A_MANO)
    expect(lineaDeLinkedin("2026-10-29T21:59:00.000Z", EL_JUEVES)).toBe(TEXTO_LINKEDIN_A_MANO)
    expect(lineaDeLinkedin(EL_JUEVES, EL_JUEVES)).toBe(TEXTO_LINKEDIN_A_MANO)
    expect(detalleDeProgramado(null, EL_JUEVES)).toBe(TEXTO_PROGRAMADO_CARRUSEL)
  })
})
