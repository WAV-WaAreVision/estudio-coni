// @vitest-environment node
import { describe, expect, it } from "vitest"
import { TEXTO_SIN_NUMEROS } from "@/lib/metricas/modelo"
import { avisarSiFaltanNumeros } from "@/lib/metricas/sin-numeros"
import { notificadorEnMemoria } from "@/lib/proveedores/avisos"

const AHORA = () => "2026-11-08T10:00:00.000Z"

describe("avisarSiFaltanNumeros (issue 111)", () => {
  it("tells WAV once a day while Métricas shows that not one reel has numbers", async () => {
    const avisos = notificadorEnMemoria()
    const avisado = await avisarSiFaltanNumeros({
      avisos: () => avisos,
      ahora: AHORA,
      leerAviso: async () => TEXTO_SIN_NUMEROS,
    })
    expect(avisado).toBe(true)
    expect(avisos.aWavEnviados).toEqual([
      {
        asunto: "Coni no tiene números de sus reels",
        detalle: expect.stringContaining("metricas-diarias"),
        idempotencia: "metricas-sin-numeros:2026-11-08",
      },
    ])
  })

  it.each([null, "No pude traer las métricas de hoy; muestro las del 7 de noviembre."])(
    "says nothing when Métricas shows %s",
    async (aviso) => {
      const avisos = notificadorEnMemoria()
      expect(await avisarSiFaltanNumeros({ avisos: () => avisos, ahora: AHORA, leerAviso: async () => aviso })).toBe(
        false,
      )
      expect(avisos.aWavEnviados).toEqual([])
    },
  )
})
