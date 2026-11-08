// @vitest-environment node
import { describe, expect, it, vi } from "vitest"
import { avisarConexionFallida } from "@/lib/acciones/conexion-fallida"
import { notificadorEnMemoria } from "@/lib/proveedores/avisos"

const AHORA = () => "2026-11-08T21:30:00.000Z"

describe("avisarConexionFallida (issue 111)", () => {
  it.each([
    ["instagram", "sin_app", "Falta configurar la app de Meta en Conidolly"],
    ["instagram", "fallo", "No pude conectar Instagram"],
    ["linkedin", "sin_app", "Falta configurar la app de LinkedIn en Conidolly"],
    ["linkedin", "fallo", "No pude conectar LinkedIn"],
  ] as const)("tells WAV once a day when %s ends in %s", async (red, motivo, asunto) => {
    const avisos = notificadorEnMemoria()
    expect(await avisarConexionFallida({ avisos: () => avisos, ahora: AHORA }, red, motivo)).toBe(true)
    expect(avisos.aWavEnviados).toEqual([
      { asunto, detalle: expect.stringContaining("Coni"), idempotencia: `conexion:${red}:${motivo}:2026-11-08` },
    ])
  })

  it.each(["conectada", "cancelada", "rechazada", "estado", "permisos"])(
    "says nothing to WAV when the outcome is %s (hers to retry, or no failure)",
    async (motivo) => {
      const avisos = notificadorEnMemoria()
      expect(await avisarConexionFallida({ avisos: () => avisos, ahora: AHORA }, "instagram", motivo)).toBe(false)
      expect(avisos.aWavEnviados).toEqual([])
    },
  )

  it("answers false and logs when the email cannot go out, so the screen does not claim Federico knows", async () => {
    const registro = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const fallido = {
      ...notificadorEnMemoria(),
      aWav: async () => {
        throw new Error("Resend caído")
      },
    }
    expect(await avisarConexionFallida({ avisos: () => fallido, ahora: AHORA }, "linkedin", "fallo")).toBe(false)
    expect(registro).toHaveBeenCalledWith(
      "No pude avisarle a WAV que falló la conexión con linkedin",
      expect.any(Error),
    )
  })
})
