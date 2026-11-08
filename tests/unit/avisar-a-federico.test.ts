import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"
import { esFallaDeLlave as esFallaDeLlaveDeLaPantalla } from "@/app/(app)/guion/[id]/textos"
import {
  asuntoDeAviso,
  claveDeAviso,
  claveDeAvisoDeSaldo,
  cuerpoDeAviso,
  cuerpoDeAvisoDeSaldo,
  ETIQUETA_AVISAR,
  esFallaDeLlave,
  fallaParaFederico,
  ocurrenciaDeFicha,
  ocurrenciaDePieza,
  TEXTO_FICHA_ILEGIBLE,
  TEXTO_LE_AVISE,
  TEXTO_YA_NO_FALLA,
} from "@/lib/dominio/avisar-a-federico"
import { TEXTO_PAUSA } from "@/lib/dominio/pausas"
import { TEXTO_LIMITE } from "@/lib/presupuesto/texto-limite"

const ID = "d0000000-0000-4000-8000-0000000000aa"
const LLAVE = "No pude preparar tu voz. ElevenLabs respondió 401: invalid_api_key"
const FICHA_BUENA = {
  resumen: "Un resumen",
  ideas_clave: ["una idea"],
  citas: [{ texto: "una cita", ubicacion: { pagina: 3 } }],
  fuente: { autor: "Alguien", anio: 2020, enlace: null },
}

describe("claveDeAviso", () => {
  it("handles the key as kind, id, the first 16 hex of the explanation's sha256 and the occurrence", async () => {
    const huella = createHash("sha256").update(LLAVE).digest("hex").slice(0, 16)
    expect(await claveDeAviso({ tipo: "pieza", id: ID, explicacion: LLAVE, ocurrencia: "i3" })).toBe(
      `pieza:${ID}:${huella}:i3`,
    )
  })

  it("gives the same key for the same failure and another for another explanation", async () => {
    const una = await claveDeAviso({ tipo: "material", id: ID, explicacion: LLAVE, ocurrencia: "f1" })
    expect(await claveDeAviso({ tipo: "material", id: ID, explicacion: LLAVE, ocurrencia: "f1" })).toBe(una)
    expect(await claveDeAviso({ tipo: "material", id: ID, explicacion: `${LLAVE}.`, ocurrencia: "f1" })).not.toBe(una)
  })

  it("gives another key when the same text comes back on a new occurrence", async () => {
    const una = await claveDeAviso({ tipo: "pieza", id: ID, explicacion: LLAVE, ocurrencia: ocurrenciaDePieza(3) })
    const otra = await claveDeAviso({ tipo: "pieza", id: ID, explicacion: LLAVE, ocurrencia: ocurrenciaDePieza(4) })
    expect(otra).not.toBe(una)
  })
})

describe("the occurrence of a failure", () => {
  it("handles a piece's occurrence as its attempt", () => {
    expect(ocurrenciaDePieza(7)).toBe("i7")
  })

  it("handles a material's occurrence as a fingerprint of its stored card row", async () => {
    const rota = { ...FICHA_BUENA, citas: "rota" }
    const una = await ocurrenciaDeFicha(rota)
    expect(una).toMatch(/^f[0-9a-f]{16}$/)
    expect(await ocurrenciaDeFicha({ ...rota })).toBe(una)
    expect(await ocurrenciaDeFicha({ ...rota, citas: "rota otra vez" })).not.toBe(una)
  })
})

describe("fallaParaFederico for a piece", () => {
  it("returns the explanation for a key failure of the voice at gate 1", () => {
    expect(fallaParaFederico({ tipo: "pieza", estado: "guion_por_aprobar", explicacion: LLAVE })).toBe(LLAVE)
    const rehacer = "ElevenLabs rechazó la llave (403)."
    expect(fallaParaFederico({ tipo: "pieza", estado: "guion_por_aprobar", explicacion: rehacer })).toBe(rehacer)
  })

  it("returns the explanation for a stopped video", () => {
    for (const estado of ["en_render", "subtitulando"]) {
      expect(fallaParaFederico({ tipo: "pieza", estado, explicacion: "HeyGen respondió 500" })).toBe(
        "HeyGen respondió 500",
      )
    }
  })

  it("returns null for a pause text, even where it would otherwise need Federico", () => {
    for (const texto of Object.values(TEXTO_PAUSA)) {
      expect(fallaParaFederico({ tipo: "pieza", estado: "guion_por_aprobar", explicacion: texto })).toBeNull()
      expect(fallaParaFederico({ tipo: "pieza", estado: "en_render", explicacion: texto })).toBeNull()
    }
  })

  it("returns null for a video stopped by her monthly limit, which she reactivates herself", () => {
    expect(fallaParaFederico({ tipo: "pieza", estado: "en_render", explicacion: TEXTO_LIMITE })).toBeNull()
  })

  it("returns null without an explanation", () => {
    expect(fallaParaFederico({ tipo: "pieza", estado: "en_render", explicacion: null })).toBeNull()
    expect(fallaParaFederico({ tipo: "pieza", estado: "guion_por_aprobar", explicacion: "  " })).toBeNull()
  })

  it("returns null for a failure she can retry herself", () => {
    const reintentable = "No pude preparar tu voz. ElevenLabs respondió 500."
    expect(fallaParaFederico({ tipo: "pieza", estado: "guion_por_aprobar", explicacion: reintentable })).toBeNull()
    expect(
      fallaParaFederico({ tipo: "pieza", estado: "guion_por_aprobar", explicacion: "HeyGen respondió 401" }),
    ).toBeNull()
  })

  it("returns null for a key failure the screen no longer shows at gate 1", () => {
    expect(fallaParaFederico({ tipo: "pieza", estado: "error_produccion", explicacion: LLAVE })).toBeNull()
    expect(fallaParaFederico({ tipo: "pieza", estado: "publicado", explicacion: LLAVE })).toBeNull()
  })
})

describe("fallaParaFederico for a material", () => {
  const listo = { tipo: "material", estado: "listo", rol: "estrategia" } as const

  it("returns the unreadable ficha text when a ready material's ficha does not parse", () => {
    expect(fallaParaFederico({ ...listo, filaDeFicha: { ...FICHA_BUENA, citas: "no es una lista" } })).toBe(
      TEXTO_FICHA_ILEGIBLE,
    )
  })

  it("returns null for a good ficha, a material still processing, or no ficha at all", () => {
    expect(fallaParaFederico({ ...listo, filaDeFicha: FICHA_BUENA })).toBeNull()
    expect(fallaParaFederico({ ...listo, estado: "procesando", filaDeFicha: { ...FICHA_BUENA, citas: 1 } })).toBeNull()
    // No row: it was processed with another role, and reprocessing (her own button) fixes it.
    expect(fallaParaFederico({ ...listo, filaDeFicha: null })).toBeNull()
  })

  it("returns null for a material whose screen shows the map, not the ficha", () => {
    expect(fallaParaFederico({ ...listo, rol: "referente", filaDeFicha: { ...FICHA_BUENA, citas: 1 } })).toBeNull()
  })
})

describe("the email", () => {
  it("handles the subject with the title", () => {
    expect(asuntoDeAviso("Sexo y ansiedad")).toBe("Coni te avisa: «Sexo y ansiedad»")
  })

  it("handles a piece's body with its kind, title, explanation and link", () => {
    const cuerpo = cuerpoDeAviso({ tipo: "pieza", id: ID, titulo: "Sexo y ansiedad", explicacion: LLAVE })
    expect(cuerpo).toContain("Pieza")
    expect(cuerpo).toContain("Sexo y ansiedad")
    expect(cuerpo).toContain(LLAVE)
    expect(cuerpo).toContain(`https://conidolly.vercel.app/guion/${ID}`)
  })

  it("handles a material's body with its link to the Biblioteca", () => {
    const cuerpo = cuerpoDeAviso({ tipo: "material", id: ID, titulo: "Un libro", explicacion: TEXTO_FICHA_ILEGIBLE })
    expect(cuerpo).toContain("Material")
    expect(cuerpo).toContain(TEXTO_FICHA_ILEGIBLE)
    expect(cuerpo).toContain(`https://conidolly.vercel.app/biblioteca/materiales/${ID}`)
  })
})

describe("the copy", () => {
  it("handles the screen's texts", () => {
    expect(ETIQUETA_AVISAR).toBe("Avisar a Federico")
    expect(TEXTO_LE_AVISE).toBe("Le avisé a Federico.")
    expect(TEXTO_YA_NO_FALLA).toBe("Esto ya no está fallando. Vuelve a abrir la pantalla.")
    expect(TEXTO_FICHA_ILEGIBLE).toBe("No pude leer la ficha de este material.")
  })

  it("keeps the screens' key failure check as the one this module owns", () => {
    expect(esFallaDeLlaveDeLaPantalla).toBe(esFallaDeLlave)
    expect(esFallaDeLlave("ElevenLabs respondió 401")).toBe(true)
    expect(esFallaDeLlave("No hay llave guardada")).toBe(true)
    expect(esFallaDeLlave("ElevenLabs respondió 500")).toBe(false)
  })
})

describe("a balance that does not reach (#101, decision 1)", () => {
  it("keys the email by piece, motivo and attempt, so a new attempt tells WAV again", () => {
    expect(claveDeAvisoDeSaldo({ id: ID, motivo: "saldo_voz", intento: 2 })).toBe(`pieza:${ID}:saldo_voz:i2`)
    expect(claveDeAvisoDeSaldo({ id: ID, motivo: "saldo_video", intento: 0 })).toBe(`pieza:${ID}:saldo_video:i0`)
  })

  it("names the provider, the piece, the estimate, the balance WAV sees and a link to the piece", () => {
    const cuerpo = cuerpoDeAvisoDeSaldo({
      id: ID,
      titulo: "Sexo y ansiedad",
      motivo: "saldo_video",
      bloqueo: "Tu saldo de API de HeyGen no alcanza (te quedan US$ 0,00 y este video cuesta unos US$ 3,48).",
      estimado: "US$ 3,48",
      saldo: "Saldo de API de HeyGen: US$ 0,00. Es aparte de tu plan de HeyGen.",
    })

    expect(cuerpo.split("\n")).toEqual([
      "Pieza: «Sexo y ansiedad»",
      "Proveedor: HeyGen",
      "Qué pasó: Tu saldo de API de HeyGen no alcanza (te quedan US$ 0,00 y este video cuesta unos US$ 3,48).",
      "Estimado: US$ 3,48",
      "Saldo: Saldo de API de HeyGen: US$ 0,00. Es aparte de tu plan de HeyGen.",
      `Ábrelo en https://conidolly.vercel.app/guion/${ID}`,
      "Coni tocó «Avisar a Federico» en esa pantalla.",
    ])
  })

  it("says ElevenLabs for her voice", () => {
    const cuerpo = cuerpoDeAvisoDeSaldo({
      id: ID,
      titulo: "T",
      motivo: "saldo_voz",
      bloqueo: "b",
      estimado: "e",
      saldo: "s",
    })
    expect(cuerpo).toContain("Proveedor: ElevenLabs")
  })
})
