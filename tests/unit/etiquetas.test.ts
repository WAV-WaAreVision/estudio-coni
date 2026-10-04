import { describe, expect, it } from "vitest"
import {
  admiteEtiquetas,
  ETIQUETAS_DE_TONO,
  etiquetasDe,
  MAXIMO_DE_ETIQUETAS,
  MINIMO_DE_ETIQUETAS,
  sinEtiquetas,
  textoParaVoz,
} from "@/lib/dominio/etiquetas"

const CON_MARCAS =
  "[warm] Hola, tú.\n\n[pause]\nHoy [softly] hablamos de límites [cálido] con calma.\n\nSoy Coni del Rosario."

describe("ETIQUETAS_DE_TONO", () => {
  it("is the closed list of the design, with no laugh", () => {
    expect(ETIQUETAS_DE_TONO).toEqual([
      "warm",
      "softly",
      "gentle",
      "reassuring",
      "encouraging",
      "thoughtful",
      "empathetic",
      "calm",
      "confident",
      "clear",
      "casual",
      "matter-of-fact",
      "pause",
      "sighs",
    ])
    expect([MINIMO_DE_ETIQUETAS, MAXIMO_DE_ETIQUETAS]).toEqual([3, 6])
  })
})

describe("etiquetasDe", () => {
  it("finds every mark with its name in lowercase and whether it is on the list", () => {
    expect(etiquetasDe("[warm] Hola [Softly] tú [matter-of-fact] y [cálido].")).toEqual([
      { escrita: "[warm]", nombre: "warm", conocida: true },
      { escrita: "[Softly]", nombre: "softly", conocida: true },
      { escrita: "[matter-of-fact]", nombre: "matter-of-fact", conocida: true },
      { escrita: "[cálido]", nombre: "cálido", conocida: false },
    ])
  })

  it("does not take brackets with digits or symbols, or a lone bracket, for a mark", () => {
    expect(etiquetasDe("Uno [1] dos [ok!] tres [ y ] cuatro")).toEqual([])
  })
})

describe("sinEtiquetas", () => {
  it("returns the very same text when there is no mark", () => {
    const texto = "Hola,  tú. \n\n\n Así es.  "
    expect(sinEtiquetas(texto)).toBe(texto)
  })

  it("removes every mark, known or not, and leaves clean spacing and paragraphs", () => {
    expect(sinEtiquetas(CON_MARCAS)).toBe("Hola, tú.\n\nHoy hablamos de límites con calma.\n\nSoy Coni del Rosario.")
  })

  it("does not leave a space before punctuation where a mark was", () => {
    expect(sinEtiquetas("Hola [warm], tú [pause].")).toBe("Hola, tú.")
  })

  it("leaves nothing when the text is only marks", () => {
    expect(sinEtiquetas("[warm] [pause]")).toBe("")
  })
})

describe("admiteEtiquetas", () => {
  it.each(["eleven_v3", "eleven_v4", "eleven_v3_alpha", "eleven_v4_preview"])("%s speaks the marks", (modelo) => {
    expect(admiteEtiquetas(modelo)).toBe(true)
  })

  it.each(["eleven_multilingual_v2", "eleven_turbo_v2_5", "eleven_flash_v2_5", "eleven_v30", "eleven_v5", ""])(
    "%s would read them aloud",
    (modelo) => {
      expect(admiteEtiquetas(modelo)).toBe(false)
    },
  )
})

describe("textoParaVoz", () => {
  it("keeps the known marks for a model that speaks them and drops the unknown ones", () => {
    expect(textoParaVoz("[warm] Hola [cálido] tú.", "eleven_v4")).toBe("[warm] Hola tú.")
  })

  it("drops every mark for a model that would read them aloud", () => {
    expect(textoParaVoz("[warm] Hola [cálido] tú.", "eleven_multilingual_v2")).toBe("Hola tú.")
  })

  it("sends a script without marks untouched to any model", () => {
    const guion = "Hola,  tú.\n\nSoy Coni del Rosario. "
    expect(textoParaVoz(guion, "eleven_v4")).toBe(guion)
    expect(textoParaVoz(guion, "eleven_multilingual_v2")).toBe(guion)
  })
})
