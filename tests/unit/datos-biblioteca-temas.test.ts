import { describe, expect, it } from "vitest"
import { conIdYNombre } from "@/lib/datos/biblioteca"

describe("conIdYNombre", () => {
  it("keeps a topic row of the view, typed with its id and name", () => {
    expect(conIdYNombre({ id: "t1", nombre: "Apego", autores: 2 })).toEqual({ id: "t1", nombre: "Apego", autores: 2 })
  })

  it("throws on a row without id or name instead of dropping it, so a page keeps its length", () => {
    expect(() => conIdYNombre({ id: null, nombre: "Apego" })).toThrow(/sin id o sin nombre/)
    expect(() => conIdYNombre({ id: "t2", nombre: null })).toThrow(/t2/)
  })
})
