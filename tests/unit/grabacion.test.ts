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

describe("presentarGrabacion", () => {
  it("prices the voice and the video, adding the voice to the video while there is none", () => {
    const sin = presentarGrabacion({
      guion: GUION,
      motor: "avatar_v",
      conVoz: false,
      saldos: BIEN,
      zona: "America/Santiago",
      modeloDeVoz: "eleven_multilingual_v2",
      quedanUsd: 37,
    })
    const voz = estimarCostoVoz(GUION)
    expect(sin.costoVoz).toBe(`Grabar voz: ~${GUION.length} caracteres (US$ ${voz.toFixed(2).replace(".", ",")})`)
    expect(sin.costoVideo).toMatch(/ · incluye la voz$/)
    expect(sin.montoVideo).toMatch(/^US\$ /)
    expect(sin.unidadVideo).toMatch(/ · incluye la voz$/)
    expect(sin.unidadVoz).toBe(`~${GUION.length} caracteres`)
    const con = presentarGrabacion({
      guion: GUION,
      motor: "avatar_v",
      conVoz: true,
      saldos: BIEN,
      zona: "America/Santiago",
      modeloDeVoz: "eleven_multilingual_v2",
      quedanUsd: 37,
    })
    expect(con.costoVideo).not.toMatch(/incluye la voz/)
    // With a voice, its cost is said once, as the helper of the "record again" button.
    expect(con.costoVoz).toBe(
      `Volver a grabar voz: ~${GUION.length} caracteres (US$ ${voz.toFixed(2).replace(".", ",")})`,
    )
    expect(con.bloqueoVoz).toBeNull()
    expect(con.bloqueoVideo).toBeNull()
  })

  it("blocks the video when the HeyGen wallet does not reach, and when the missing voice does not reach", () => {
    const sinBilletera = { ...BIEN, heygen: { ok: true, tipo: "billetera", moneda: "usd", saldo: 0 } } as const
    expect(
      presentarGrabacion({
        guion: GUION,
        motor: "avatar_v",
        conVoz: true,
        saldos: sinBilletera,
        zona: "America/Santiago",
        modeloDeVoz: "eleven_multilingual_v2",
        quedanUsd: 37,
      }).bloqueoVideo,
    ).toMatch(/^Tu saldo de API de HeyGen no alcanza/)
    const sinCaracteres = {
      ...BIEN,
      elevenlabs: { ok: true, usados: 100_000, limite: 100_000, renuevaEn: null, puedeExceder: false },
    } as const
    const sin = presentarGrabacion({
      guion: GUION,
      motor: "avatar_v",
      conVoz: false,
      saldos: sinCaracteres,
      zona: "America/Santiago",
      modeloDeVoz: "eleven_multilingual_v2",
      quedanUsd: 37,
    })
    expect(sin.bloqueoVoz).toMatch(/^No te alcanzan los caracteres/)
    expect(sin.bloqueoVideo).toBe(sin.bloqueoVoz)
    const con = presentarGrabacion({
      guion: GUION,
      motor: "avatar_v",
      conVoz: true,
      saldos: sinCaracteres,
      zona: "America/Santiago",
      modeloDeVoz: "eleven_multilingual_v2",
      quedanUsd: 37,
    })
    expect(con.bloqueoVideo).toBeNull()
  })

  it("never blocks when the balances could not be read", () => {
    const fallidos: Saldos = { elevenlabs: { ok: false, motivo: "x" }, heygen: { ok: false, motivo: "x" } }
    const r = presentarGrabacion({
      guion: GUION,
      motor: null,
      conVoz: false,
      saldos: fallidos,
      zona: "America/Santiago",
      modeloDeVoz: "eleven_multilingual_v2",
      quedanUsd: 37,
    })
    expect(r.bloqueoVoz).toBeNull()
    expect(r.bloqueoVideo).toBeNull()
    expect(r.saldoVoz).toBe("No pude ver tu saldo de ElevenLabs.")
    expect(r.saldoVideo).toBe("No pude ver tu saldo de API de HeyGen.")
  })
})

describe("presentarGrabacion y el tope del mes", () => {
  const TOPE = "Llegaste al tope de gasto de este mes. Súbelo en Ajustes o espera al próximo mes."
  const entrada = (conVoz: boolean, quedanUsd: number) => ({
    guion: GUION,
    motor: "avatar_v",
    conVoz,
    saldos: BIEN,
    zona: "America/Santiago",
    modeloDeVoz: "eleven_multilingual_v2",
    quedanUsd,
  })

  it("blocks the voice and the video, with one short line, when the month cannot cover them", () => {
    const sin = presentarGrabacion(entrada(false, 0))
    expect(sin.bloqueoVoz).toBe(TOPE)
    expect(sin.bloqueoVideo).toBe(TOPE)
  })

  it("lets the voice through but stops the video when only the voice fits", () => {
    const voz = estimarCostoVoz(GUION)
    const r = presentarGrabacion(entrada(false, voz + 0.0001))
    expect(r.bloqueoVoz).toBeNull()
    expect(r.bloqueoVideo).toBe(TOPE)
  })

  it("counts only the video when the voice exists", () => {
    const video = estimarCostoVideo(GUION, "avatar_v")
    expect(presentarGrabacion(entrada(true, video + 0.0001)).bloqueoVideo).toBeNull()
    expect(presentarGrabacion(entrada(true, video / 2)).bloqueoVideo).toBe(TOPE)
  })

  it("does not block anything when the month has room", () => {
    const r = presentarGrabacion(entrada(false, 37))
    expect(r.bloqueoVoz).toBeNull()
    expect(r.bloqueoVideo).toBeNull()
  })
})

describe("presentarGrabacion con marcas de tono", () => {
  const CON_MARCAS = "[warm] Hola, soy Coni. [softly] Hoy hablamos de límites."
  const entrada = (modeloDeVoz: string, saldos: Saldos = BIEN) => ({
    guion: CON_MARCAS,
    motor: "avatar_v",
    conVoz: false,
    saldos,
    zona: "America/Santiago",
    modeloDeVoz,
    quedanUsd: 37,
  })
  const conQuedan = (quedan: number): Saldos => ({
    ...BIEN,
    elevenlabs: { ok: true, usados: 100_000 - quedan, limite: 100_000, renuevaEn: null, puedeExceder: false },
  })

  it("prices the characters ElevenLabs actually receives: the marks only on a model that speaks them", () => {
    const v4 = textoParaVoz(CON_MARCAS, "eleven_v4")
    const v2 = textoParaVoz(CON_MARCAS, "eleven_multilingual_v2")
    expect(v4.length).toBeGreaterThan(v2.length)
    expect(presentarGrabacion(entrada("eleven_v4")).costoVoz).toBe(
      `Grabar voz: ~${v4.length} caracteres (US$ ${estimarCostoVoz(v4).toFixed(2).replace(".", ",")})`,
    )
    expect(presentarGrabacion(entrada("eleven_multilingual_v2")).costoVoz).toContain(`~${v2.length} caracteres`)
  })

  it("blocks on the characters actually sent, not on the stored script", () => {
    const v2 = textoParaVoz(CON_MARCAS, "eleven_multilingual_v2")
    expect(presentarGrabacion(entrada("eleven_multilingual_v2", conQuedan(v2.length))).bloqueoVoz).toBeNull()
    expect(presentarGrabacion(entrada("eleven_multilingual_v2", conQuedan(v2.length - 1))).bloqueoVoz).not.toBeNull()
  })
})
