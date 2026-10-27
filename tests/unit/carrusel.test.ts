import { describe, expect, it } from "vitest"
import {
  cambiosQuedan,
  FIRMA_DEL_CARRUSEL,
  laminasDelEscrito,
  MAXIMO_CAMBIOS_DE_TEXTO,
  nombreDeLamina,
  palabrasDe,
  palabrasDelCarrusel,
  TEXTO_SIN_CAMBIOS_DE_TEXTO,
  textoDeLaPublicacion,
} from "@/lib/dominio/carrusel"
import { DE_CONI } from "@/lib/dominio/fuente"
import { hashTextoDeCarrusel } from "@/lib/dominio/puertas"
import { ESCRITO_DE_PRUEBA, FUENTE_DEL_CARRUSEL, LAMINAS_DE_PRUEBA, TEXTO_POST_DE_PRUEBA } from "../fixtures/carrusel"

describe("laminasDelEscrito", () => {
  it("orders portada, ideas and closing question, with the app's source line on the last slide", () => {
    expect(laminasDelEscrito(ESCRITO_DE_PRUEBA, FUENTE_DEL_CARRUSEL)).toEqual(LAMINAS_DE_PRUEBA)
  })

  it("adds no source line for a backing that is all Coni's, or none", () => {
    expect(laminasDelEscrito(ESCRITO_DE_PRUEBA, DE_CONI).at(-1)).not.toHaveProperty("fuente")
    expect(laminasDelEscrito(ESCRITO_DE_PRUEBA, null).at(-1)).not.toHaveProperty("fuente")
  })

  it("keeps a highlighted word only when it is one of the slide's own words", () => {
    const escrito = {
      ...ESCRITO_DE_PRUEBA,
      ideas: [{ texto: "No nota el silencio.", destacado: "ruido" }, ...ESCRITO_DE_PRUEBA.ideas.slice(1)],
    }
    expect(laminasDelEscrito(escrito, null)[1]).toEqual({ tipo: "idea", texto: "No nota el silencio." })
  })

  it("normalizes line breaks, Unicode and the spaces around each text", () => {
    const escrito = { ...ESCRITO_DE_PRUEBA, portada: { texto: "  Lo que un chatbot\r\nno ve  " } }
    expect(laminasDelEscrito(escrito, null)[0]?.texto).toBe("Lo que un chatbot\nno ve")
  })
})

describe("textoDeLaPublicacion", () => {
  it("ends with the source line and the signature, both added by the app", () => {
    expect(textoDeLaPublicacion(ESCRITO_DE_PRUEBA.textoPost, FUENTE_DEL_CARRUSEL)).toBe(TEXTO_POST_DE_PRUEBA)
  })

  it("never repeats a source line or a signature the text already has", () => {
    expect(textoDeLaPublicacion(TEXTO_POST_DE_PRUEBA, FUENTE_DEL_CARRUSEL)).toBe(TEXTO_POST_DE_PRUEBA)
  })

  it("signs without a line when the backing is Coni's", () => {
    expect(textoDeLaPublicacion("Hola.", DE_CONI)).toBe(`Hola.\n\n${FIRMA_DEL_CARRUSEL}`)
  })
})

describe("hashTextoDeCarrusel", () => {
  const texto = { laminas: LAMINAS_DE_PRUEBA, textoPost: TEXTO_POST_DE_PRUEBA }
  const base = hashTextoDeCarrusel(texto)

  it("is a SHA-256 of the words and the post", () => {
    expect(base).toMatch(/^[0-9a-f]{64}$/)
  })

  it("does not move when the slides are split or merged, or a highlight changes (design D2, D5)", () => {
    const [portada, a, b, ...resto] = LAMINAS_DE_PRUEBA
    if (!portada || !a || !b) throw new Error("Faltan láminas en la prueba")
    const juntas = [portada, { tipo: "idea" as const, texto: `${a.texto} ${b.texto}` }, ...resto]
    const sinDestacados = LAMINAS_DE_PRUEBA.map(({ destacado: _destacado, ...lamina }) => lamina)
    const partida = [
      portada,
      { tipo: "idea" as const, texto: "Un chatbot te responde a cualquier hora." },
      { tipo: "idea" as const, texto: "Eso ayuda, pero no te conoce." },
      b,
      ...resto,
    ]
    for (const laminas of [juntas, sinDestacados, partida]) {
      expect(hashTextoDeCarrusel({ laminas, textoPost: TEXTO_POST_DE_PRUEBA })).toBe(base)
    }
  })

  it("moves with any word of a slide, of the source line or of the post", () => {
    const otraPalabra = LAMINAS_DE_PRUEBA.map((l, i) =>
      i === 2 ? { ...l, texto: l.texto.replace("largo", "corto") } : l,
    )
    const otraFuente = LAMINAS_DE_PRUEBA.map((l) => (l.tipo === "cierre" ? { ...l, fuente: "Fuente: Otra" } : l))
    expect(hashTextoDeCarrusel({ laminas: otraPalabra, textoPost: TEXTO_POST_DE_PRUEBA })).not.toBe(base)
    expect(hashTextoDeCarrusel({ laminas: otraFuente, textoPost: TEXTO_POST_DE_PRUEBA })).not.toBe(base)
    expect(hashTextoDeCarrusel({ laminas: LAMINAS_DE_PRUEBA, textoPost: `${TEXTO_POST_DE_PRUEBA}.` })).not.toBe(base)
  })

  it("reads the words in order", () => {
    expect(
      palabrasDelCarrusel([
        { tipo: "idea", texto: "uno\n dos" },
        { tipo: "cierre", texto: "tres", fuente: "cuatro" },
      ]),
    ).toBe("uno dos tres cuatro")
  })
})

describe("names and counts for the screen", () => {
  it("names each slide by its place and kind", () => {
    expect(LAMINAS_DE_PRUEBA.map(nombreDeLamina)).toEqual([
      "Lámina 1 · Portada",
      "Lámina 2 · Idea",
      "Lámina 3 · Idea",
      "Lámina 4 · Idea",
      "Lámina 5 · Idea",
      "Lámina 6 · Cierre",
    ])
  })

  it("counts the text changes left, never below zero", () => {
    expect([0, 1, 2, 3, 4].map(cambiosQuedan)).toEqual([3, 2, 1, 0, 0])
  })
})

describe("TEXTO_SIN_CAMBIOS_DE_TEXTO", () => {
  it("says the limit the database enforces, from the one constant both the screen and the action read", () => {
    expect(TEXTO_SIN_CAMBIOS_DE_TEXTO).toBe(`Ya pediste ${MAXIMO_CAMBIOS_DE_TEXTO} cambios. Puedes firmarlo como está.`)
  })
})

describe("palabrasDe", () => {
  it("splits words as the database's palabras_de does: letters and decimal digits only", () => {
    expect(palabrasDe("Mide 30 m² y ½ de alto")).toEqual(["Mide", "30", "m", "y", "de", "alto"])
  })

  it("keeps decimal digits of any script, as [[:digit:]] does", () => {
    expect(palabrasDe("abc٣")).toEqual(["abc٣"])
  })
})
