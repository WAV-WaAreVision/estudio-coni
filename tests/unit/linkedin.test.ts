import { describe, expect, it } from "vitest"
import { textoDeLinkedinDesdeInstagram } from "@/lib/dominio/linkedin"
import { AVISO_AVATAR, AVISO_AVATAR_LINKEDIN } from "@/lib/dominio/revision"

describe("textoDeLinkedinDesdeInstagram", () => {
  it("drops the hashtags of the caption and puts the LinkedIn notice where the Instagram one was", () => {
    expect(textoDeLinkedinDesdeInstagram(`Hola #sexo #pareja\n${AVISO_AVATAR}`)).toBe(`Hola\n${AVISO_AVATAR_LINKEDIN}`)
  })

  it("drops a line that only held hashtags and keeps the paragraphs apart", () => {
    const caption = `Primera idea.\n\nSegunda idea.\n\n#limites #pareja\n\n${AVISO_AVATAR}`
    expect(textoDeLinkedinDesdeInstagram(caption)).toBe(`Primera idea.\n\nSegunda idea.\n\n${AVISO_AVATAR_LINKEDIN}`)
  })

  it("closes the gap a hashtag leaves in the middle of a sentence", () => {
    expect(textoDeLinkedinDesdeInstagram("Me gusta #sexualidad mucho.")).toBe("Me gusta mucho.")
  })

  it("keeps a number sign that is not a hashtag", () => {
    expect(textoDeLinkedinDesdeInstagram("Somos el # uno y el 5#")).toBe("Somos el # uno y el 5#")
  })

  it("leaves the text alone when it has neither hashtags nor the Instagram notice", () => {
    expect(textoDeLinkedinDesdeInstagram("Una idea simple.")).toBe("Una idea simple.")
  })

  it("trims what is left at both ends", () => {
    expect(textoDeLinkedinDesdeInstagram("  #a Hola.  \n")).toBe("Hola.")
  })
})
