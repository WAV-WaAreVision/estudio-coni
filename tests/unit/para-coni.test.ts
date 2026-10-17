import { describe, expect, it } from "vitest"
import { esDeOperacion, separarParaConi } from "@/lib/diseno/para-coni"

const EN_SUS_PALABRAS = "No alcanza el saldo para grabar el video. Avísale a Federico."

describe("esDeOperacion", () => {
  it("spots provider names, API balances and keys", () => {
    expect(esDeOperacion("Tu saldo de API de HeyGen no alcanza.")).toBe(true)
    expect(esDeOperacion("ElevenLabs: te quedan 23.400 de 100.000 caracteres.")).toBe(true)
    expect(esDeOperacion("Anthropic respondió 529.")).toBe(true)
    expect(esDeOperacion("Claude no respondió a tiempo.")).toBe(true)
    expect(esDeOperacion("No hay saldo de API para tu llave.")).toBe(true)
    expect(esDeOperacion("Coni todavía no ingresó su llave en Ajustes.")).toBe(true)
  })

  it("leaves what is written for her alone", () => {
    expect(esDeOperacion("Llegaste al tope de gasto de este mes. Súbelo en Ajustes para seguir.")).toBe(false)
    expect(esDeOperacion("No pude preparar tu voz. Vuelve a intentarlo con Preparar mi voz.")).toBe(false)
    expect(esDeOperacion("Tu reel quedó publicado, pero falta el aviso. Revisa la publicación.")).toBe(false)
  })
})

describe("separarParaConi", () => {
  it("keeps a text written for her as the main text, with no detail", () => {
    const texto = "Llegaste al tope de gasto de este mes. Súbelo en Ajustes para seguir."
    expect(separarParaConi(texto, EN_SUS_PALABRAS)).toEqual({ texto, detalle: [], proveedor: null })
  })

  it("says it in her words and moves the provider's text, with a link to it, to WAV's detail", () => {
    const tecnico = "Tu saldo de API de HeyGen no alcanza (te quedan US$ 0,00 y este video cuesta US$ 3,48)."
    expect(separarParaConi(tecnico, EN_SUS_PALABRAS)).toEqual({
      texto: EN_SUS_PALABRAS,
      detalle: [tecnico],
      proveedor: { nombre: "HeyGen", href: "https://app.heygen.com" },
    })
  })

  it("links ElevenLabs and Anthropic to their own consoles", () => {
    expect(separarParaConi("ElevenLabs no respondió.", "x").proveedor).toEqual({
      nombre: "ElevenLabs",
      href: "https://elevenlabs.io/app",
    })
    expect(separarParaConi("Anthropic respondió 529.", "x").proveedor).toEqual({
      nombre: "Anthropic",
      href: "https://console.anthropic.com",
    })
  })

  it("adds operator lines (a balance) to the detail and keeps her text when it is already hers", () => {
    const saldo = "Saldo de API de HeyGen: US$ 12,00. Es aparte de tu plan de HeyGen."
    expect(separarParaConi("No pude terminar el video.", "x", [saldo])).toEqual({
      texto: "No pude terminar el video.",
      detalle: [saldo],
      proveedor: { nombre: "HeyGen", href: "https://app.heygen.com" },
    })
  })
})
