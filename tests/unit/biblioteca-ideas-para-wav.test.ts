import { describe, expect, it } from "vitest"
import { lineasDeIdeaParaWav } from "@/lib/dominio/biblioteca/detalle"

describe("lineasDeIdeaParaWav (4h)", () => {
  it("folds the type of idea, its evidence and its id, each line unique", () => {
    expect(lineasDeIdeaParaWav({ id: "i-1", tipo: "mito", evidencia: "clinica" })).toEqual([
      "Tipo de idea: Mito",
      "Evidencia: Clínica",
      "Idea: i-1",
    ])
  })

  it("says the code when a value has no word", () => {
    expect(lineasDeIdeaParaWav({ id: "i-2", tipo: "nuevo", evidencia: "otra" })).toEqual([
      "Tipo de idea: nuevo",
      "Evidencia: otra",
      "Idea: i-2",
    ])
  })
})
