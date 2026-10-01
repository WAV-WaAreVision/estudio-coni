// @vitest-environment node
import { describe, expect, it } from "vitest"
import type { EstadoDeCuenta } from "@/lib/ajustes/estado"
import { filaDeCuenta } from "@/lib/ajustes/presentar"

const AHORA = Date.parse("2026-10-01T15:00:00Z")
const DIA = 24 * 60 * 60 * 1000

describe("filaDeCuenta", () => {
  const casos: [EstadoDeCuenta, { estado: string; tono: string }][] = [
    [
      { cuenta: "heygen", estado: "lista" },
      { estado: "Conectada", tono: "ok" },
    ],
    [
      { cuenta: "heygen", estado: "falta" },
      { estado: "Falta", tono: "aviso" },
    ],
    [
      { cuenta: "heygen", estado: "rechazada", motivo: "HTTP 401" },
      { estado: "No aceptó la llave", tono: "error" },
    ],
    [
      { cuenta: "heygen", estado: "sin_respuesta" },
      { estado: "Sin revisar", tono: "neutro" },
    ],
    [
      { cuenta: "instagram", estado: "vence", expiraEn: AHORA + 6 * DIA },
      { estado: "Vence en 6 días", tono: "aviso" },
    ],
    [
      { cuenta: "instagram", estado: "vence", expiraEn: AHORA + 0.4 * DIA },
      { estado: "Vence mañana", tono: "aviso" },
    ],
    [
      { cuenta: "instagram", estado: "vencida" },
      { estado: "Desconectada", tono: "error" },
    ],
  ]

  for (const [entrada, esperado] of casos) {
    it(`reads ${entrada.cuenta} ${entrada.estado} as "${esperado.estado}"`, () => {
      expect(filaDeCuenta(entrada, AHORA)).toMatchObject(esperado)
    })
  }

  it("names the account the way Coni knows it", () => {
    expect(filaDeCuenta({ cuenta: "anthropic", estado: "lista" }, AHORA).nombre).toBe("Claude (Anthropic)")
    expect(filaDeCuenta({ cuenta: "instagram", estado: "lista" }, AHORA).nombre).toBe("Instagram")
  })

  it("never carries the technical reason of a rejection to the screen", () => {
    expect(
      JSON.stringify(filaDeCuenta({ cuenta: "heygen", estado: "rechazada", motivo: "HTTP 401 secreto" }, AHORA)),
    ).not.toContain("secreto")
  })
})
