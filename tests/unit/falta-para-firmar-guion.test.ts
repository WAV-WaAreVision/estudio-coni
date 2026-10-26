// tests/unit/falta-para-firmar-guion.test.ts
import { describe, expect, it } from "vitest"
import {
  type EstadoDeLaFirma,
  faltaParaFirmar,
  faltaParaFirmarCarrusel,
} from "@/app/(app)/guion/[id]/falta-para-firmar"
import type { Hallazgo } from "@/lib/dominio/revision"

const LISTA: EstadoDeLaFirma = {
  sinGuardar: false,
  preparando: false,
  voz: "voces/p1/t-x-0.mp3",
  escuchada: "voces/p1/t-x-0.mp3",
  bloqueos: 0,
  sinRevisar: [],
  sinAvatares: false,
  avatarElegido: true,
  bloqueoVideo: null,
}
const FRASE: Hallazgo = { regla: "cifra_sin_verificar", tipo: "advierte", mensaje: "Verifica.", frase: "la mayoría" }
const PUNTO: Hallazgo = { regla: "tema_de_riesgo", tipo: "advierte", mensaje: "Sexualidad." }

describe("faltaParaFirmar", () => {
  it("lets her sign when nothing is missing", () => {
    expect(faltaParaFirmar(LISTA)).toEqual({ tipo: "nada" })
  })

  it("lists every missing item, in order", () => {
    expect(
      faltaParaFirmar({
        ...LISTA,
        sinGuardar: true,
        voz: null,
        escuchada: null,
        bloqueos: 1,
        sinRevisar: [FRASE, FRASE],
        avatarElegido: false,
      }),
    ).toEqual({
      tipo: "falta",
      cosas: ["guardar tus cambios", "preparar tu voz", "corregir el guion", "revisar 2 frases", "elegir el avatar"],
    })
  })

  it("says which step of her voice is missing", () => {
    expect(faltaParaFirmar({ ...LISTA, preparando: true })).toEqual({ tipo: "falta", cosas: ["que termine tu voz"] })
    expect(faltaParaFirmar({ ...LISTA, voz: null, escuchada: null })).toEqual({
      tipo: "falta",
      cosas: ["preparar tu voz"],
    })
    expect(faltaParaFirmar({ ...LISTA, escuchada: "voces/p1/t-x-0-vieja.mp3" })).toEqual({
      tipo: "falta",
      cosas: ["escuchar tu voz"],
    })
  })

  it("asks to review phrases, or warnings when one quotes none", () => {
    expect(faltaParaFirmar({ ...LISTA, sinRevisar: [FRASE] })).toEqual({ tipo: "falta", cosas: ["revisar 1 frase"] })
    expect(faltaParaFirmar({ ...LISTA, sinRevisar: [FRASE, PUNTO] })).toEqual({
      tipo: "falta",
      cosas: ["revisar 2 avisos"],
    })
  })

  it("says HeyGen's balance or the month's cap as a block, before anything missing", () => {
    const bloqueo = "Tu saldo de API de HeyGen no alcanza (te quedan US$ 0,00 y este video cuesta unos US$ 3,48)."
    expect(faltaParaFirmar({ ...LISTA, voz: null, sinGuardar: true, bloqueoVideo: bloqueo })).toEqual({
      tipo: "bloqueo",
      texto: bloqueo,
    })
  })

  it("blocks with today's text when there are no looks to choose", () => {
    expect(faltaParaFirmar({ ...LISTA, sinAvatares: true, avatarElegido: false })).toEqual({
      tipo: "bloqueo",
      texto: "Todavía no hay avatares para elegir: avísale a Federico.",
    })
  })
})

describe("faltaParaFirmarCarrusel", () => {
  const aviso = { regla: "largo_lamina" as const, tipo: "advierte" as const, mensaje: "La lámina 1 es larga." }
  it("opens with nothing blocking and every warning ticked", () => {
    expect(faltaParaFirmarCarrusel({ bloqueos: 0, sinRevisar: [] })).toEqual({ tipo: "nada" })
  })
  it("asks for a change when the review blocks (she cannot edit), and to look at what is left", () => {
    expect(faltaParaFirmarCarrusel({ bloqueos: 1, sinRevisar: [aviso] })).toEqual({
      tipo: "falta",
      cosas: ["pedir un cambio", "revisar 1 aviso"],
    })
  })
})
