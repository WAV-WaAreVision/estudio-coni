import { describe, expect, it } from "vitest"
import { estimarCreditosVideo } from "@/lib/produccion/grabar"

const GUION = "Hola, soy Coni. Hoy hablamos de límites."

describe("estimarCreditosVideo", () => {
  it("counts the same render in credits, rounded up", () => {
    // 7 words at 150 a minute is 2.8 s: 2.24 credits of avatar_v, 0.75 of Avatar IV
    expect(estimarCreditosVideo(GUION, "avatar_v")).toBe(3)
    expect(estimarCreditosVideo(GUION, null)).toBe(1)
  })
})
