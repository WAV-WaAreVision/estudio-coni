// tests/unit/grabacion.test.ts
import { describe, expect, it } from "vitest"
import { presentarGrabacion } from "@/lib/datos/grabacion"
import { textoParaVoz } from "@/lib/dominio/etiquetas"
import type { Saldos } from "@/lib/dominio/saldos"
import { TEXTO_LIMITE } from "@/lib/presupuesto/limite"
import { estimarCostoVoz } from "@/lib/produccion/comun"

const GUION = "Hola, soy Coni. Hoy hablamos de límites."
const BIEN: Saldos = {
  elevenlabs: { ok: true, usados: 0, limite: 100_000, renuevaEn: null, puedeExceder: false },
  heygen: { ok: true, tipo: "billetera", moneda: "usd", saldo: 50 },
}

const ENTRADA = {
  guion: GUION,
  motor: "avatar_v",
  saldos: BIEN,
  zona: "America/Santiago",
  modeloDeVoz: "eleven_multilingual_v2",
  quedanUsd: 37,
  pausas: [],
}

describe("presentarGrabacion", () => {
  it("prices her voice for the layout and blocks nothing when everything reaches", () => {
    const r = presentarGrabacion(ENTRADA)

    expect(r.montoVoz).toBe(`US$ ${estimarCostoVoz(GUION).toFixed(2).replace(".", ",")}`)
    expect(r.unidadVoz).toBe(`~${GUION.length} caracteres`)
    expect(r.saldoVoz).toMatch(/^ElevenLabs: te quedan/)
    expect(r.bloqueoVoz).toBeNull()
    expect(r.bloqueoVideo).toBeNull()
  })

  it("blocks the video when the HeyGen wallet does not reach", () => {
    const sinBilletera = { ...BIEN, heygen: { ok: true, tipo: "billetera", moneda: "usd", saldo: 0 } } as const

    expect(presentarGrabacion({ ...ENTRADA, saldos: sinBilletera }).bloqueoVideo).toMatch(
      /^Tu saldo de API de HeyGen no alcanza/,
    )
  })

  it("blocks the voice and not the video when the characters do not reach: the voice comes first", () => {
    const sinCaracteres = {
      ...BIEN,
      elevenlabs: { ok: true, usados: 100_000, limite: 100_000, renuevaEn: null, puedeExceder: false },
    } as const

    const r = presentarGrabacion({ ...ENTRADA, saldos: sinCaracteres })

    expect(r.bloqueoVoz).toMatch(/^No te alcanzan los caracteres/)
    expect(r.bloqueoVideo).toBeNull()
  })

  it("never blocks when the balances could not be read", () => {
    const fallidos: Saldos = { elevenlabs: { ok: false, motivo: "x" }, heygen: { ok: false, motivo: "x" } }
    const r = presentarGrabacion({ ...ENTRADA, motor: null, saldos: fallidos })
    expect(r.bloqueoVoz).toBeNull()
    expect(r.bloqueoVideo).toBeNull()
    expect(r.saldoVoz).toBe("No pude ver tu saldo de ElevenLabs.")
  })
})

describe("presentarGrabacion y el límite del mes", () => {
  const entrada = (quedanUsd: number) => ({ ...ENTRADA, quedanUsd })

  it("closes the voice, with the plain line, when the month's limit cannot cover it: it is new spend", () => {
    expect(presentarGrabacion(entrada(0)).bloqueoVoz).toBe(TEXTO_LIMITE)
  })

  it("lets the voice through when it fits what is left of the limit", () => {
    expect(presentarGrabacion(entrada(estimarCostoVoz(GUION) + 0.0001)).bloqueoVoz).toBeNull()
  })

  it("never closes the signature for the month: the recording it starts is signed work", () => {
    expect(presentarGrabacion(entrada(0)).bloqueoVideo).toBeNull()
  })
})

describe("presentarGrabacion con marcas de tono", () => {
  const CON_MARCAS = "[warm] Hola, soy Coni. [softly] Hoy hablamos de límites."
  const entrada = (modeloDeVoz: string, saldos: Saldos = BIEN) => ({
    ...ENTRADA,
    guion: CON_MARCAS,
    saldos,
    modeloDeVoz,
  })
  const conQuedan = (quedan: number): Saldos => ({
    ...BIEN,
    elevenlabs: { ok: true, usados: 100_000 - quedan, limite: 100_000, renuevaEn: null, puedeExceder: false },
  })

  it("prices the characters ElevenLabs actually receives: the marks only on a model that speaks them", () => {
    const v4 = textoParaVoz(CON_MARCAS, "eleven_v4")
    const v2 = textoParaVoz(CON_MARCAS, "eleven_multilingual_v2")
    expect(v4.length).toBeGreaterThan(v2.length)
    expect(presentarGrabacion(entrada("eleven_v4"))).toMatchObject({
      unidadVoz: `~${v4.length} caracteres`,
      montoVoz: `US$ ${estimarCostoVoz(v4).toFixed(2).replace(".", ",")}`,
    })
    expect(presentarGrabacion(entrada("eleven_multilingual_v2")).unidadVoz).toBe(`~${v2.length} caracteres`)
  })

  it("blocks on the characters actually sent, not on the stored script", () => {
    const v2 = textoParaVoz(CON_MARCAS, "eleven_multilingual_v2")
    expect(presentarGrabacion(entrada("eleven_multilingual_v2", conQuedan(v2.length))).bloqueoVoz).toBeNull()
    expect(presentarGrabacion(entrada("eleven_multilingual_v2", conQuedan(v2.length - 1))).bloqueoVoz).not.toBeNull()
  })
})

describe("presentarGrabacion con proveedores en pausa", () => {
  it("closes the voice with its pause text first, and the signature with HeyGen's", () => {
    const botones = presentarGrabacion({ ...ENTRADA, quedanUsd: 0, pausas: ["elevenlabs", "heygen"] })
    expect(botones.bloqueoVoz).toBe("Tu voz está en pausa. Ya le avisamos a WAV.")
    expect(botones.bloqueoVideo).toBe("Tu video está en pausa. Ya le avisamos a WAV.")
  })

  it("leaves both open without pauses", () => {
    expect(presentarGrabacion({ ...ENTRADA, pausas: [] })).toMatchObject({ bloqueoVoz: null, bloqueoVideo: null })
  })

  it("is not closed by a Claude or Voyage pause", () => {
    expect(presentarGrabacion({ ...ENTRADA, pausas: ["claude", "voyage"] })).toMatchObject({
      bloqueoVoz: null,
      bloqueoVideo: null,
    })
  })
})

describe("presentarGrabacion: un saldo que no alcanza (#101, decisión 1)", () => {
  const sinNada: Saldos = {
    elevenlabs: { ok: true, usados: 100_000, limite: 100_000, renuevaEn: null, puedeExceder: false },
    heygen: { ok: true, tipo: "billetera", moneda: "usd", saldo: 0 },
  }

  it("marks both blocks as a balance that does not reach, so «Avisar a Federico» sits beside them", () => {
    expect(presentarGrabacion({ ...ENTRADA, saldos: sinNada })).toMatchObject({
      vozSinSaldo: true,
      videoSinSaldo: true,
    })
  })

  it("never marks a pause or the month's limit as a balance block", () => {
    expect(presentarGrabacion({ ...ENTRADA, saldos: sinNada, pausas: ["elevenlabs", "heygen"] })).toMatchObject({
      vozSinSaldo: false,
      videoSinSaldo: false,
    })
    expect(presentarGrabacion({ ...ENTRADA, saldos: sinNada, quedanUsd: 0 }).vozSinSaldo).toBe(false)
  })

  it("marks nothing when the balances reach or could not be read", () => {
    expect(presentarGrabacion(ENTRADA)).toMatchObject({ vozSinSaldo: false, videoSinSaldo: false })
    const fallidos: Saldos = { elevenlabs: { ok: false, motivo: "x" }, heygen: { ok: false, motivo: "x" } }
    expect(presentarGrabacion({ ...ENTRADA, saldos: fallidos })).toMatchObject({
      vozSinSaldo: false,
      videoSinSaldo: false,
    })
  })

  it("gives the HeyGen balance line WAV already sees, for his email", () => {
    expect(presentarGrabacion({ ...ENTRADA, saldos: sinNada }).saldoVideo).toBe(
      "Saldo de API de HeyGen: US$ 0,00. Es aparte de tu plan de HeyGen.",
    )
  })
})
