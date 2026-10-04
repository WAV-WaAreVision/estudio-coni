import { HttpResponse, http } from "msw"
import { describe, expect, it } from "vitest"
import { leerSaldoElevenlabs, leerSaldoHeygen } from "@/lib/proveedores/saldos"
import { servidor } from "../msw"

const ELEVEN = "https://api.elevenlabs.io"
const HEYGEN = "https://api.heygen.com"

describe("leerSaldoElevenlabs", () => {
  it("reads characters used, limit and reset date with Coni's key", async () => {
    let llave: string | null = null
    servidor.use(
      http.get(`${ELEVEN}/v1/user/subscription`, ({ request }) => {
        llave = request.headers.get("xi-api-key")
        return HttpResponse.json({
          tier: "creator",
          status: "active",
          character_count: 76_600,
          character_limit: 100_000,
          next_character_count_reset_unix: 1_760_281_200,
          can_extend_character_limit: true,
          allowed_to_extend_character_limit: false,
        })
      }),
    )
    expect(await leerSaldoElevenlabs({ clave: "sk_x", base: ELEVEN })).toEqual({
      ok: true,
      usados: 76_600,
      limite: 100_000,
      renuevaEn: new Date(1_760_281_200 * 1000).toISOString(),
      puedeExceder: false,
    })
    expect(llave).toBe("sk_x")
  })

  it("answers ok false, without the key or the body, on an error or an unexpected answer", async () => {
    servidor.use(
      http.get(`${ELEVEN}/v1/user/subscription`, () => HttpResponse.json({ detail: "sk_x bad" }, { status: 401 })),
    )
    expect(await leerSaldoElevenlabs({ clave: "sk_x", base: ELEVEN })).toEqual({ ok: false, motivo: "HTTP 401" })
    servidor.use(http.get(`${ELEVEN}/v1/user/subscription`, () => HttpResponse.json({ nada: true })))
    expect(await leerSaldoElevenlabs({ clave: "sk_x", base: ELEVEN })).toEqual({ ok: false, motivo: "formato" })
    servidor.use(http.get(`${ELEVEN}/v1/user/subscription`, () => HttpResponse.error()))
    expect(await leerSaldoElevenlabs({ clave: "sk_x", base: ELEVEN })).toEqual({ ok: false, motivo: "sin_conexion" })
  })
})

describe("leerSaldoHeygen", () => {
  it("reads the API wallet of GET /v3/users/me", async () => {
    let llave: string | null = null
    servidor.use(
      http.get(`${HEYGEN}/v3/users/me`, ({ request }) => {
        llave = request.headers.get("x-api-key")
        return HttpResponse.json({
          data: { username: "coni", billing_type: "wallet", wallet: { currency: "usd", remaining_balance: 12.5 } },
        })
      }),
    )
    expect(await leerSaldoHeygen({ clave: "hg_x", base: HEYGEN })).toEqual({
      ok: true,
      tipo: "billetera",
      moneda: "usd",
      saldo: 12.5,
    })
    expect(llave).toBe("hg_x")
  })

  it("reads a wallet in credits", async () => {
    servidor.use(
      http.get(`${HEYGEN}/v3/users/me`, () =>
        HttpResponse.json({
          data: { billing_type: "wallet", wallet: { currency: "credits", remaining_balance: 300 } },
        }),
      ),
    )
    expect(await leerSaldoHeygen({ clave: "hg_x", base: HEYGEN })).toEqual({
      ok: true,
      tipo: "billetera",
      moneda: "creditos",
      saldo: 300,
    })
  })

  it("says there is no wallet for subscription billing, and ok false on errors", async () => {
    servidor.use(
      http.get(`${HEYGEN}/v3/users/me`, () =>
        HttpResponse.json({ data: { billing_type: "subscription", subscription: { plan: "creator" } } }),
      ),
    )
    expect(await leerSaldoHeygen({ clave: "hg_x", base: HEYGEN })).toEqual({
      ok: true,
      tipo: "sin_billetera",
      facturacion: "subscription",
    })
    servidor.use(http.get(`${HEYGEN}/v3/users/me`, () => new HttpResponse("no", { status: 500 })))
    expect(await leerSaldoHeygen({ clave: "hg_x", base: HEYGEN })).toEqual({ ok: false, motivo: "HTTP 500" })
  })
})
