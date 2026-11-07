import { describe, expect, it } from "vitest"
import { Falla } from "@/lib/dominio/falla"
import {
  esProveedorConPausa,
  esTextoDePausa,
  explicacionAnteLaPausa,
  mensajeTecnico,
  PausaDeProveedor,
  proveedorDelTextoDePausa,
  TEXTO_PAUSA,
  TEXTO_PAUSA_CERRADA,
  TEXTO_PAUSA_DE_BIBLIOTECA,
  textoDePausa,
  textoDePausaDeBiblioteca,
} from "@/lib/dominio/pausas"

describe("PausaDeProveedor", () => {
  it("is a Falla whose message is the Coni text of its provider", () => {
    const pausa = new PausaDeProveedor("elevenlabs", "pago", "ElevenLabs respondió HTTP 401: payment_issue", 401)
    expect(pausa).toBeInstanceOf(Falla)
    expect(pausa.message).toBe("Tu voz está en pausa. Ya le avisamos a WAV.")
    expect(pausa).toMatchObject({ proveedor: "elevenlabs", motivo: "pago", http: 401, name: "PausaDeProveedor" })
  })

  it("caps the technical detail at 400 characters", () => {
    const pausa = new PausaDeProveedor("voyage", "llave", "x".repeat(900), 401)
    expect(pausa.detalle).toHaveLength(400)
  })
})

describe("texts", () => {
  it("has the four texts of the spec, without em dashes", () => {
    expect(TEXTO_PAUSA).toEqual({
      elevenlabs: "Tu voz está en pausa. Ya le avisamos a WAV.",
      heygen: "Tu video está en pausa. Ya le avisamos a WAV.",
      claude: "Las ideas y los guiones están en pausa. Ya le avisamos a WAV.",
      voyage: "La Biblioteca está en pausa. Ya le avisamos a WAV.",
    })
    expect(TEXTO_PAUSA_CERRADA).toEqual({
      elevenlabs: "Ya puedes preparar tu voz de nuevo.",
      heygen: "Ya puedes grabar tus videos de nuevo.",
      claude: "Las ideas y los guiones funcionan de nuevo.",
      voyage: "La Biblioteca funciona de nuevo.",
    })
    for (const texto of [...Object.values(TEXTO_PAUSA), ...Object.values(TEXTO_PAUSA_CERRADA)]) {
      expect(texto).not.toContain("\u2014")
    }
  })

  it("recognises a stored pause text and its provider", () => {
    expect(proveedorDelTextoDePausa(TEXTO_PAUSA.heygen)).toBe("heygen")
    expect(proveedorDelTextoDePausa("No pude preparar tu voz.")).toBeNull()
    expect(proveedorDelTextoDePausa(null)).toBeNull()
  })

  it("does not claim the Biblioteca text for Voyage, which writes no text (amendment A6)", () => {
    expect(proveedorDelTextoDePausa(TEXTO_PAUSA_DE_BIBLIOTECA)).toBeNull()
    expect(esTextoDePausa(TEXTO_PAUSA_DE_BIBLIOTECA)).toBe(true)
    expect(esTextoDePausa(TEXTO_PAUSA.claude)).toBe(true)
    expect(esTextoDePausa("No pude preparar tu voz.")).toBe(false)
  })

  it("answers the text of an open pause, or null", () => {
    expect(textoDePausa(["claude"], "claude")).toBe(TEXTO_PAUSA.claude)
    expect(textoDePausa(["claude"], "heygen")).toBeNull()
  })

  it("closes the Biblioteca only while Claude is paused", () => {
    expect(textoDePausaDeBiblioteca(["claude"])).toBe(TEXTO_PAUSA_DE_BIBLIOTECA)
    // Amendment A6: a Voyage pause is WAV's only; it disables nothing for Coni.
    expect(textoDePausaDeBiblioteca(["voyage"])).toBeNull()
    expect(textoDePausaDeBiblioteca(["elevenlabs"])).toBeNull()
    expect(TEXTO_PAUSA_DE_BIBLIOTECA).toBe(TEXTO_PAUSA.voyage)
  })

  it("knows its providers", () => {
    expect(esProveedorConPausa("claude")).toBe(true)
    expect(esProveedorConPausa("anthropic")).toBe(false)
  })
})

describe("mensajeTecnico", () => {
  it("answers WAV's detail of a pause, not Coni's text", () => {
    const pausa = new PausaDeProveedor("heygen", "llave", "HeyGen respondió HTTP 401: Invalid API key", 401)
    expect(mensajeTecnico(pausa)).toBe("HeyGen respondió HTTP 401: Invalid API key")
  })

  it("answers the message of any other error, and the value itself otherwise", () => {
    expect(mensajeTecnico(new Error("boom"))).toBe("boom")
    expect(mensajeTecnico("raro")).toBe("raro")
  })
})

describe("explicacionAnteLaPausa", () => {
  const GENERICO = "Algo no salió como esperábamos con esta pieza."

  it("says nothing more while the piece's pause is open: the line under «Reintentar» says it", () => {
    expect(explicacionAnteLaPausa(TEXTO_PAUSA.heygen, TEXTO_PAUSA.heygen, GENERICO)).toBeNull()
  })

  it("forgets a pause text once that pause closed", () => {
    expect(explicacionAnteLaPausa(TEXTO_PAUSA.heygen, null, GENERICO)).toBe(GENERICO)
  })

  it("keeps any other reason, and the generic line when there is none", () => {
    expect(explicacionAnteLaPausa("HeyGen no pudo terminar el video.", TEXTO_PAUSA.heygen, GENERICO)).toBe(
      "HeyGen no pudo terminar el video.",
    )
    expect(explicacionAnteLaPausa(null, null, GENERICO)).toBe(GENERICO)
  })
})
