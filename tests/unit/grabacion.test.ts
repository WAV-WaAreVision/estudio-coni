// tests/unit/grabacion.test.ts
import { describe, expect, it } from "vitest"
import { presentarGrabacion } from "@/lib/datos/grabacion"
import { textoParaVoz } from "@/lib/dominio/etiquetas"
import type { Saldos } from "@/lib/dominio/saldos"
import { estimarCostoVoz } from "@/lib/produccion/comun"
import { estimarCostoVideo } from "@/lib/produccion/grabar"

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

describe("presentarGrabacion y el tope del mes", () => {
  const TOPE = "Llegaste al tope de gasto de este mes. Súbelo en Ajustes o espera al próximo mes."
  const entrada = (quedanUsd: number) => ({ ...ENTRADA, quedanUsd })

  it("blocks the voice and the video, with one short line, when the month cannot cover them", () => {
    const sin = presentarGrabacion(entrada(0))
    expect(sin.bloqueoVoz).toBe(TOPE)
    expect(sin.bloqueoVideo).toBe(TOPE)
  })

  it("lets the voice through but stops the video when only the voice fits", () => {
    const voz = estimarCostoVoz(GUION)
    const r = presentarGrabacion(entrada(voz + 0.0001))
    expect(r.bloqueoVoz).toBeNull()
    expect(r.bloqueoVideo).toBe(TOPE)
  })

  it("counts only the video for the signature: the voice is already made", () => {
    const video = estimarCostoVideo(GUION, "avatar_v")
    expect(presentarGrabacion(entrada(video + 0.0001)).bloqueoVideo).toBeNull()
    expect(presentarGrabacion(entrada(video / 2)).bloqueoVideo).toBe(TOPE)
  })

  it("does not block anything when the month has room", () => {
    const r = presentarGrabacion(entrada(37))
    expect(r.bloqueoVoz).toBeNull()
    expect(r.bloqueoVideo).toBeNull()
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
