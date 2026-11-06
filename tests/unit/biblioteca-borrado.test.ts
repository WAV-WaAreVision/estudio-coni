import { describe, expect, it } from "vitest"
import { avisoTrasBorrar, hrefTrasBorrar, leerBorrado, sePuedeBorrarAutor } from "@/lib/dominio/biblioteca/borrado"

const ID = "11111111-2222-4333-8444-555555555555"

describe("hrefTrasBorrar", () => {
  it("lands a material on Materiales and an author on Autores, with the note and the id", () => {
    expect(hrefTrasBorrar("material", ID)).toBe(`/biblioteca?aviso=borrado&id=${ID}`)
    expect(hrefTrasBorrar("autor", ID)).toBe(`/biblioteca/autores?aviso=borrado&id=${ID}`)
  })
})

describe("leerBorrado", () => {
  it("reads the id when the note is the deletion's", () => {
    expect(leerBorrado({ aviso: "borrado", id: ID })).toBe(ID)
    expect(leerBorrado({ aviso: ["borrado", "x"], id: [` ${ID} `] })).toBe(ID)
  })

  it("is null for another note, a missing or malformed id, or no note", () => {
    expect(leerBorrado({ aviso: "borrador-guardado", id: ID })).toBeNull()
    expect(leerBorrado({ aviso: "borrado" })).toBeNull()
    expect(leerBorrado({ aviso: "borrado", id: "../../x" })).toBeNull()
    expect(leerBorrado({})).toBeNull()
  })
})

describe("avisoTrasBorrar", () => {
  it("names what she deleted, or says it plainly when it had no title", () => {
    expect(avisoTrasBorrar("Charla larga")).toBe("Borré «Charla larga».")
    expect(avisoTrasBorrar(null)).toBe("Lo borré.")
  })
})

describe("sePuedeBorrarAutor", () => {
  const vacio = { materiales: 0, ideas: 0, ocultas: 0 }

  it("allows an author with no live material and no idea, visible or hidden", () => {
    expect(sePuedeBorrarAutor({ tipo: "persona" }, vacio)).toBe(true)
  })

  it("never offers it on Coni's own card", () => {
    expect(sePuedeBorrarAutor({ tipo: "coni" }, vacio)).toBe(false)
  })

  it.each([
    ["a material", { ...vacio, materiales: 1 }],
    ["a visible idea", { ...vacio, ideas: 1 }],
    ["a hidden idea", { ...vacio, ocultas: 1 }],
  ])("does not offer it for an author with %s, as Coni's function refuses it", (_, cuenta) => {
    expect(sePuedeBorrarAutor({ tipo: "persona" }, cuenta)).toBe(false)
  })
})
