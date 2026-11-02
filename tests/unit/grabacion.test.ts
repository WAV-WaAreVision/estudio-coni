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
