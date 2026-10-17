// tests/unit/falta-para-firmar-video.test.ts
import { describe, expect, it } from "vitest"
import {
  type EstadoDeLaFirmaDelVideo,
  faltaParaFirmarVideo,
  LISTO_PARA_FIRMAR,
  resumenDeMasOpciones,
} from "@/app/(app)/video/[id]/falta-para-firmar"
import type { Hallazgo } from "@/lib/dominio/revision"

const LISTA: EstadoDeLaFirmaDelVideo = {
  visto: true,
  revisado: true,
  linkedinSinGuardar: false,
  editando: false,
  bloqueos: 0,
  sinRevisar: [],
  hayFecha: true,
}
const FRASE: Hallazgo = { regla: "numeros", tipo: "advierte", mensaje: "Escribe los números con palabras.", frase: "3" }

describe("faltaParaFirmarVideo", () => {
  it("lets her sign when nothing is missing, and says what is done", () => {
    expect(faltaParaFirmarVideo(LISTA)).toEqual({ tipo: "nada" })
    expect(LISTO_PARA_FIRMAR).toEqual(["Video visto", "Texto"])
  })

  it("lists every missing item, in order", () => {
    expect(
      faltaParaFirmarVideo({
        visto: false,
        revisado: false,
        linkedinSinGuardar: true,
        editando: true,
        bloqueos: 1,
        sinRevisar: [FRASE, FRASE],
        hayFecha: true,
      }),
    ).toEqual({
      tipo: "falta",
      cosas: [
        "terminar el video",
        "marcar lo que revisaste",
        "guardar el texto para LinkedIn",
        "guardar o cancelar la edición del texto",
        "corregir el texto",
        "revisar 2 frases",
      ],
    })
  })

  it("says a missing slot as a block", () => {
    expect(faltaParaFirmarVideo({ ...LISTA, visto: false, hayFecha: false })).toEqual({
      tipo: "bloqueo",
      texto: "No hay un horario libre. Avísale a Federico.",
    })
  })
})

describe("resumenDeMasOpciones", () => {
  it("names the destinations she can still add, and the re-recording", () => {
    expect(resumenDeMasOpciones(["instagram"])).toBe("LinkedIn, regrabar video")
    expect(resumenDeMasOpciones(["linkedin"])).toBe("Instagram, regrabar video")
    expect(resumenDeMasOpciones(["instagram", "linkedin"])).toBe("Destinos, regrabar video")
  })
})
