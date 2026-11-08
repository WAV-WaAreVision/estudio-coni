// @vitest-environment node
import { describe, expect, it } from "vitest"
import { avisarErrorDePantalla } from "@/lib/acciones/error-de-pantalla"
import { notificadorEnMemoria } from "@/lib/proveedores/avisos"

const AHORA = () => "2026-11-08T21:30:00.000Z"

describe("avisarErrorDePantalla (issue 111)", () => {
  it("tells WAV which screen failed and its digest, once a day per screen whatever the digest", async () => {
    const avisos = notificadorEnMemoria()
    const resultado = await avisarErrorDePantalla(
      { avisos: () => avisos, ahora: AHORA },
      { registro: "Una pantalla no pudo cargar", digest: "123abc" },
    )
    expect(resultado).toEqual({ ok: true })
    expect(avisos.aWavEnviados).toEqual([
      {
        asunto: "Coni vio una pantalla de error",
        detalle: expect.stringMatching(/Una pantalla no pudo cargar[\s\S]*123abc/),
        idempotencia: "pantalla:Una pantalla no pudo cargar:2026-11-08",
      },
    ])
  })

  it("says when the error came without a digest (a client failure)", async () => {
    const avisos = notificadorEnMemoria()
    await avisarErrorDePantalla({ avisos: () => avisos, ahora: AHORA }, { registro: "Una pantalla no pudo cargar" })
    expect(avisos.aWavEnviados[0]?.detalle).toContain("Digest: sin digest")
  })

  it("answers an error when the email cannot go out, so the screen does not say Federico knows", async () => {
    const fallido = {
      ...notificadorEnMemoria(),
      aWav: async () => {
        throw new Error("Resend caído")
      },
    }
    const original = console.error
    console.error = () => undefined
    const resultado = await avisarErrorDePantalla({ avisos: () => fallido, ahora: AHORA }, { registro: "x" })
    console.error = original
    expect(resultado.ok).toBe(false)
  })
})
