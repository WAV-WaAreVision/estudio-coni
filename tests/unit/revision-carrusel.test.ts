import { describe, expect, it } from "vitest"
import { leerRevision } from "@/lib/datos/revision"
import type { Lamina } from "@/lib/dominio/carrusel"
import { ETIQUETAS_DE_TONO } from "@/lib/dominio/etiquetas"
import { type Ajeno, LINEAS_AYUDA, revisarCarrusel } from "@/lib/dominio/revision"
import { LAMINAS_DE_PRUEBA, TEXTO_POST_DE_PRUEBA } from "../fixtures/carrusel"

const SIN_AJENO: Ajeno = { citas: [], autores: [], personas: [], citadas: [], titulosCitados: [] }
const revisar = (cambios: Partial<Parameters<typeof revisarCarrusel>[0]> = {}) =>
  revisarCarrusel({
    laminas: LAMINAS_DE_PRUEBA,
    textoPost: TEXTO_POST_DE_PRUEBA,
    requiereLineasAyuda: false,
    ajeno: SIN_AJENO,
    ...cambios,
  })
const conLamina = (indice: number, texto: string): Lamina[] =>
  LAMINAS_DE_PRUEBA.map((lamina, i) => (i === indice ? { ...lamina, texto } : lamina))
const reglas = (hallazgos: ReturnType<typeof revisar>) => hallazgos.map((h) => `${h.regla}:${h.tipo}`)

describe("revisarCarrusel", () => {
  it("finds nothing in a carousel that follows every rule, without asking for the avatar notice", () => {
    expect(revisar()).toEqual([])
  })

  it("blocks any avatar mention, on a slide or in the post (C11)", () => {
    expect(reglas(revisar({ laminas: conLamina(2, "Lo dice mi avatar digital.") }))).toContain("mencion_avatar:bloquea")
    const enElPost = revisar({ textoPost: `${TEXTO_POST_DE_PRUEBA}\n\nLo narra mi avatar.` })
    expect(enElPost).toContainEqual(
      expect.objectContaining({ regla: "mencion_avatar", tipo: "bloquea", campo: "linkedin" }),
    )
  })

  it("blocks emojis, hashtags, mentions and tone marks on a slide", () => {
    for (const texto of [
      "Respira 🌿",
      "Hablemos #saludmental",
      "Como dice @alguien",
      `[${ETIQUETAS_DE_TONO[0]}] Respira.`,
    ]) {
      expect(
        reglas(revisar({ laminas: conLamina(1, texto) })).some((r) => r.endsWith(":bloquea")),
        texto,
      ).toBe(true)
    }
  })

  it("warns on a slide too long for the template, by its number", () => {
    const hallazgos = revisar({ laminas: conLamina(0, "a".repeat(91)) })
    expect(hallazgos).toEqual([
      { regla: "largo_lamina", tipo: "advierte", mensaje: "La lámina 1 tiene 91 caracteres. Cabe bien hasta 90." },
    ])
  })

  it("warns on a post outside 600 to 1.300 characters, and never with the reel's 1.000 rule", () => {
    const corto = revisar({ textoPost: "Un texto corto.\n\n¿Te pasa?" })
    expect(reglas(corto)).toContain("largo_post_carrusel:advierte")
    expect(reglas(corto)).not.toContain("largo_corto_linkedin:advierte")
    expect(reglas(revisar({ textoPost: `${TEXTO_POST_DE_PRUEBA}\n\n${"Una línea más. ".repeat(40)}` }))).toContain(
      "largo_post_carrusel:advierte",
    )
  })

  it("asks for the help lines in the post when the topic needs them", () => {
    expect(reglas(revisar({ requiereLineasAyuda: true }))).toContain("lineas_ayuda:bloquea")
    expect(
      reglas(revisar({ requiereLineasAyuda: true, textoPost: `${TEXTO_POST_DE_PRUEBA}\n\n${LINEAS_AYUDA}` })),
    ).not.toContain("lineas_ayuda:bloquea")
  })

  it("warns on a slide that copies a source, names an author or implies a consultation", () => {
    const cita = "las personas que usan apps de bienestar suelen sentirse acompañadas de noche"
    const ajeno = { ...SIN_AJENO, citas: [cita], autores: ["Esther Perel"], personas: ["Esther Perel"] }
    expect(reglas(revisar({ ajeno, laminas: conLamina(1, `Dicen que ${cita}.`) }))).toContain(
      "copia_de_fuente:advierte",
    )
    expect(reglas(revisar({ ajeno, laminas: conLamina(1, "Como dice Esther Perel, el deseo cambia.") }))).toContain(
      "nombra_autor:advierte",
    )
    expect(reglas(revisar({ laminas: conLamina(1, "En consulta veo esto seguido.") }))).toContain(
      "sugiere_consulta:advierte",
    )
  })

  it("keeps the LinkedIn rules of the post, such as no numbered emojis", () => {
    expect(reglas(revisar({ textoPost: `${TEXTO_POST_DE_PRUEBA}\n\n1️⃣ Uno` }))).toContain("formato_linkedin:bloquea")
  })

  it("stores findings that the saved review can read back", () => {
    const hallazgos = revisar({ laminas: conLamina(0, "a".repeat(91)), textoPost: "Corto." })
    expect(leerRevision(JSON.parse(JSON.stringify(hallazgos)))).toEqual(hallazgos)
  })
})
