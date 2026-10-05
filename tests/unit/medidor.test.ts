import { describe, expect, it } from "vitest"
import { tonoDelMedidor } from "@/lib/diseno/medidor"

describe("tonoDelMedidor", () => {
  it("is ink below 80 percent of the cap", () =>
    expect(tonoDelMedidor(31.99, 40)).toEqual({ tono: "tinta", porcentaje: 79.975, alTope: false }))
  it("turns to aviso from 80 percent", () => expect(tonoDelMedidor(32, 40).tono).toBe("aviso"))
  it("says the cap is reached at 100 percent and clamps the bar", () =>
    expect(tonoDelMedidor(45, 40)).toEqual({ tono: "aviso", porcentaje: 100, alTope: true }))
  it("handles a zero cap without dividing by zero", () =>
    expect(tonoDelMedidor(0, 0)).toEqual({ tono: "tinta", porcentaje: 0, alTope: false }))
})
