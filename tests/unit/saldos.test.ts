import { describe, expect, it } from "vitest"
import {
  alcanceDeVideo,
  alcanceDeVoz,
  costoDeVoz,
  lineaDeFirma,
  lineaDeSaldoVideo,
  lineaDeSaldoVoz,
  type SaldoElevenlabs,
  type SaldoHeygen,
} from "@/lib/dominio/saldos"

const ELEVEN: SaldoElevenlabs = {
  ok: true,
  usados: 76_600,
  limite: 100_000,
  renuevaEn: "2026-10-12T15:00:00.000Z",
  puedeExceder: false,
}
const BILLETERA: SaldoHeygen = { ok: true, tipo: "billetera", moneda: "usd", saldo: 12 }

describe("alcanceDeVoz", () => {
  it("reaches when the characters left cover the script", () => {
    expect(alcanceDeVoz(ELEVEN, 1100)).toEqual({ tipo: "alcanza" })
  })
  it("does not reach, and says what to do, when they do not", () => {
    expect(alcanceDeVoz({ ...ELEVEN, usados: 99_200 }, 1100)).toEqual({
      tipo: "no_alcanza",
      mensaje:
        "No te alcanzan los caracteres de ElevenLabs (te quedan 800 y esta voz usa 1.100). Recarga o mejora tu plan en elevenlabs.io, en Suscripción.",
    })
  })
  it("reaches past the limit when the plan bills the extra characters", () => {
    expect(alcanceDeVoz({ ...ELEVEN, usados: 100_000, puedeExceder: true }, 1100)).toEqual({ tipo: "alcanza" })
  })
  it("does not know when the lookup failed", () => {
    expect(alcanceDeVoz({ ok: false, motivo: "HTTP 401" }, 1100)).toEqual({ tipo: "no_se_sabe" })
  })
})

describe("alcanceDeVideo", () => {
  it("compares dollars with dollars and credits with credits", () => {
    expect(alcanceDeVideo(BILLETERA, { usd: 3.73, creditos: 45 })).toEqual({ tipo: "alcanza" })
    expect(
      alcanceDeVideo({ ok: true, tipo: "billetera", moneda: "creditos", saldo: 40 }, { usd: 3.73, creditos: 45 }).tipo,
    ).toBe("no_alcanza")
  })
  it("says the API balance is not the plan's credits when it does not reach", () => {
    expect(alcanceDeVideo({ ...BILLETERA, saldo: 1.2 }, { usd: 3.73, creditos: 45 })).toEqual({
      tipo: "no_alcanza",
      mensaje:
        "Tu saldo de API de HeyGen no alcanza (te quedan US$ 1,20 y este video cuesta unos US$ 3,73). Recárgalo en app.heygen.com, en la sección API. Los créditos de tu plan de HeyGen no sirven para grabar desde Conidolly.",
    })
  })
  it("does not know without a wallet or without an answer", () => {
    expect(
      alcanceDeVideo({ ok: true, tipo: "sin_billetera", facturacion: "subscription" }, { usd: 1, creditos: 1 }),
    ).toEqual({ tipo: "no_se_sabe" })
    expect(alcanceDeVideo({ ok: false, motivo: "sin_conexion" }, { usd: 1, creditos: 1 })).toEqual({
      tipo: "no_se_sabe",
    })
  })
})

describe("líneas", () => {
  it("writes the balances the way Coni reads them", () => {
    expect(lineaDeSaldoVoz(ELEVEN, "America/Santiago")).toBe(
      "ElevenLabs: te quedan 23.400 de 100.000 caracteres. Se renuevan el 12 de octubre.",
    )
    expect(lineaDeSaldoVoz({ ...ELEVEN, renuevaEn: null }, "America/Santiago")).toBe(
      "ElevenLabs: te quedan 23.400 de 100.000 caracteres.",
    )
    expect(lineaDeSaldoVoz({ ok: false, motivo: "x" }, "America/Santiago")).toBe("No pude ver tu saldo de ElevenLabs.")
    expect(lineaDeSaldoVideo(BILLETERA)).toBe("Saldo de API de HeyGen: US$ 12,00. Es aparte de tu plan de HeyGen.")
    expect(lineaDeSaldoVideo({ ok: true, tipo: "billetera", moneda: "creditos", saldo: 1200 })).toBe(
      "Saldo de API de HeyGen: 1.200 créditos. Es aparte de tu plan de HeyGen.",
    )
    expect(lineaDeSaldoVideo({ ok: true, tipo: "sin_billetera", facturacion: "subscription" })).toBe(
      "HeyGen no informa un saldo de API para tu llave.",
    )
    expect(lineaDeSaldoVideo({ ok: false, motivo: "x" })).toBe("No pude ver tu saldo de API de HeyGen.")
  })

  it("splits the cost of the voice in the amount and its unit, the figure the screens set beside the action", () => {
    expect(costoDeVoz(1100, 0.33)).toEqual({ monto: "US$ 0,33", unidad: "~1.100 caracteres" })
  })

  it("never uses an em dash", () => {
    const todas = [
      lineaDeSaldoVoz(ELEVEN, "America/Santiago"),
      lineaDeSaldoVideo(BILLETERA),
      lineaDeFirma({ segundos: 10, usd: 1 }),
      lineaDeFirma(null),
    ]
    for (const linea of todas) expect(linea).not.toContain("—")
  })
})

describe("lineaDeFirma", () => {
  it("says what the signature spends and how long she has to undo it", () => {
    expect(lineaDeFirma({ segundos: 52.4, usd: 3.48 })).toBe(
      "Al firmar grabo el video: ~52 s, US$ 3,48. Tienes 8 s para deshacer.",
    )
  })

  it("still says the video starts and the undo window when the cost cannot be read", () => {
    expect(lineaDeFirma(null)).toBe("Al firmar grabo el video. Tienes 8 s para deshacer.")
  })
})
