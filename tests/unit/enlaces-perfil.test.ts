import { describe, expect, it } from "vitest"
import { NOMBRE_PUBLICO, TITULO_PUBLICO } from "@/lib/enlaces/perfil"

describe("perfil público de /l", () => {
  it("shows her as Constanza del Rosario, Psicóloga-Coach PUC (decision A8)", () => {
    expect(NOMBRE_PUBLICO).toBe("Constanza del Rosario")
    expect(TITULO_PUBLICO).toBe("Psicóloga-Coach PUC")
  })
})
