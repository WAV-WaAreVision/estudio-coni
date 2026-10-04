import { describe, expect, it, vi } from "vitest"
import type { SaldoElevenlabs, SaldoHeygen } from "@/lib/dominio/saldos"
import { lectorDeSaldos } from "@/lib/saldos/leer"

const ELEVEN: SaldoElevenlabs = { ok: true, usados: 1, limite: 10, renuevaEn: null, puedeExceder: false }
const HEYGEN: SaldoHeygen = { ok: true, tipo: "billetera", moneda: "usd", saldo: 5 }

function armar(opciones: { heygen?: () => Promise<SaldoHeygen>; llaves?: (n: string) => Promise<string | null> } = {}) {
  let reloj = 1_000
  const elevenlabs = vi.fn(async () => ELEVEN)
  const heygen = vi.fn(opciones.heygen ?? (async () => HEYGEN))
  const leer = lectorDeSaldos({
    leerLlave: vi.fn(opciones.llaves ?? (async (nombre: string) => `llave-${nombre}`)),
    elevenlabs,
    heygen,
    ahora: () => reloj,
  })
  return {
    leer,
    elevenlabs,
    heygen,
    avanzar: (ms: number) => {
      reloj += ms
    },
  }
}

describe("lectorDeSaldos", () => {
  it("reads both balances with each key", async () => {
    const { leer, elevenlabs, heygen } = armar()
    expect(await leer()).toEqual({ elevenlabs: ELEVEN, heygen: HEYGEN })
    expect(elevenlabs).toHaveBeenCalledWith("llave-elevenlabs")
    expect(heygen).toHaveBeenCalledWith("llave-heygen")
  })

  it("keeps an answer for a minute and shares one request between callers", async () => {
    const { leer, heygen, avanzar } = armar()
    await Promise.all([leer(), leer()])
    expect(heygen).toHaveBeenCalledTimes(1)
    avanzar(59_000)
    await leer()
    expect(heygen).toHaveBeenCalledTimes(1)
    avanzar(2_000)
    await leer()
    expect(heygen).toHaveBeenCalledTimes(2)
  })

  it("keeps a failure only 15 seconds", async () => {
    const { leer, heygen, avanzar } = armar({ heygen: async () => ({ ok: false, motivo: "HTTP 500" }) })
    await leer()
    avanzar(16_000)
    await leer()
    expect(heygen).toHaveBeenCalledTimes(2)
  })

  it("answers sin_llave without calling a provider whose key is missing", async () => {
    const { leer, heygen } = armar({ llaves: async (n) => (n === "heygen" ? null : "llave") })
    expect((await leer()).heygen).toEqual({ ok: false, motivo: "sin_llave" })
    expect(heygen).not.toHaveBeenCalled()
  })

  it("answers both as failed, and logs it, when reading the keys breaks", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const { leer } = armar({
      llaves: async () => {
        throw new Error("vault caído")
      },
    })
    expect(await leer()).toEqual({
      elevenlabs: { ok: false, motivo: "error" },
      heygen: { ok: false, motivo: "error" },
    })
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })
})
