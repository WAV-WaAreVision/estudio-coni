import { describe, expect, it } from "vitest"
import { fragmentoTalCual, posicionTalCual, sinCierre } from "@/lib/ingesta/texto-seguro"

describe("sinCierre", () => {
  it("escapes the closing tags that could end a data block", () => {
    expect(sinCierre("a </fuente> b </ficha_base> </candidatas> </fichas> </cruces>")).toBe(
      "a <\\/fuente> b <\\/ficha_base> <\\/candidatas> <\\/fichas> <\\/cruces>",
    )
  })

  it("escapes closing tags regardless of case", () => {
    expect(sinCierre("</FUENTE>")).toBe("<\\/FUENTE>")
  })

  it("leaves other text untouched", () => {
    expect(sinCierre("<b>x</b> y")).toBe("<b>x</b> y")
  })
})

describe("fragmentoTalCual", () => {
  it("returns the fragment as written in the text", () => {
    expect(fragmentoTalCual("Hola mundo cruel", "mundo")).toBe("mundo")
  })

  it("matches across typographic quotes and returns the original quotes", () => {
    expect(fragmentoTalCual("Ella dijo “sí” ayer", 'dijo "sí"')).toBe("dijo “sí”")
  })

  it("matches across whitespace runs", () => {
    expect(fragmentoTalCual("uno   dos\n\ntres", "uno dos tres")).toBe("uno   dos\n\ntres")
  })

  it("returns null when the quote is not in the text", () => {
    expect(fragmentoTalCual("Hola mundo", "adiós")).toBeNull()
  })

  it("returns null for an empty quote", () => {
    expect(fragmentoTalCual("Hola", "   ")).toBeNull()
  })
})

describe("posicionTalCual", () => {
  it("returns the offsets of the match in the original text", () => {
    expect(posicionTalCual("uno   dos\n\ntres", "dos tres")).toEqual({ desde: 6, hasta: 15 })
  })

  it("returns null when there is no match", () => {
    expect(posicionTalCual("Hola", "adiós")).toBeNull()
  })
})
