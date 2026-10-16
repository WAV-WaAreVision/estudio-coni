import { describe, expect, it } from "vitest"
import { ICONO } from "@/components/ui/icono"

describe("ICONO", () => {
  it("sizes Phosphor icons in em, so they grow with the iOS text size", () => {
    expect(ICONO).toEqual({
      mini: "0.85em",
      chico: "1em",
      medio: "1.2em",
      grande: "1.45em",
      amplio: "1.6em",
      cierre: "1.9em",
    })
  })
})
