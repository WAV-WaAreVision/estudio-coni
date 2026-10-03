// @vitest-environment node
import { describe, expect, it } from "vitest"
import { idiomaPorHeuristica } from "@/lib/ingesta/idioma"
import type { Parte } from "@/lib/ingesta/partes"

const pagina = (texto: string): Parte => ({ texto, ubicacion: { pagina: 1 } })

const TEXTO_ES =
  "Cuando una pareja deja de hablar de lo que siente, la distancia se vuelve cada vez más grande y es difícil volver a empezar."
const TEXTO_EN =
  "When a couple stops talking about what they feel, the distance becomes bigger and it is hard to start again from there."

describe("idiomaPorHeuristica", () => {
  it("decides clear Spanish and English text by itself", () => {
    expect(idiomaPorHeuristica([pagina(TEXTO_ES)])).toBe("es")
    expect(idiomaPorHeuristica([pagina(TEXTO_EN)])).toBe("en")
  })

  it("returns null when the text is too short to say", () => {
    expect(idiomaPorHeuristica([pagina("Bonjour")])).toBeNull()
  })
})
