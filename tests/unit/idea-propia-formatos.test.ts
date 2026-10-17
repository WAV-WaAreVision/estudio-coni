import { describe, expect, it } from "vitest"
import { FORMATOS } from "@/app/(app)/ideas/idea-propia"

describe("FORMATOS of Coni's own idea", () => {
  it("offers only the guide's formats, without the sexology ones Federico dropped", () => {
    expect(FORMATOS).toEqual(["Mito o realidad", "Tres señales", "Pregunta de la audiencia"])
  })
})
