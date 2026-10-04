// tests/unit/grabacion.test.ts
import { describe, expect, it } from "vitest"
import { presentarGrabacion } from "@/lib/datos/grabacion"
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
    })
    const voz = estimarCostoVoz(GUION)
    const video = estimarCostoVideo(GUION, "avatar_v")
    expect(sin.costoVoz).toBe(`Grabar voz: ~${GUION.length} caracteres (US$ ${voz.toFixed(2).replace(".", ",")})`)
    expect(sin.costoVideo).toMatch(/ · incluye la voz$/)
    expect(sin.confirmacionVideo).toBe(
      `¿Grabar el video? Cuesta unos US$ ${(video + voz).toFixed(2).replace(".", ",")}.`,
    )
    const con = presentarGrabacion({
      guion: GUION,
      motor: "avatar_v",
      conVoz: true,
      saldos: BIEN,
      zona: "America/Santiago",
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
    })
    expect(sin.bloqueoVoz).toMatch(/^No te alcanzan los caracteres/)
    expect(sin.bloqueoVideo).toBe(sin.bloqueoVoz)
    const con = presentarGrabacion({
      guion: GUION,
      motor: "avatar_v",
      conVoz: true,
      saldos: sinCaracteres,
      zona: "America/Santiago",
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
    })
    expect(r.bloqueoVoz).toBeNull()
    expect(r.bloqueoVideo).toBeNull()
    expect(r.saldoVoz).toBe("No pude ver tu saldo de ElevenLabs.")
    expect(r.saldoVideo).toBe("No pude ver tu saldo de API de HeyGen.")
  })
})
