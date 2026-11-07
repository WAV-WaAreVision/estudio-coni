// @vitest-environment node
import { HttpResponse, http } from "msw"
import { describe, expect, it } from "vitest"
import { chequearProveedor } from "@/lib/proveedores/chequeos"
import { servidor } from "../msw"

const LLAVE = "llave-secreta-de-prueba"
const BASES = { elevenlabs: "https://api.elevenlabs.io", heygen: "https://api.heygen.com" }
const SUSCRIPCION = {
  status: "active",
  has_open_invoices: true,
  character_count: 10,
  character_limit: 100,
  can_extend_character_limit: false,
}

function suscripcion(cambios: Record<string, unknown>) {
  servidor.use(
    http.get(`${BASES.elevenlabs}/v1/user/subscription`, () => HttpResponse.json({ ...SUSCRIPCION, ...cambios })),
  )
}

describe("chequearProveedor elevenlabs", () => {
  it("is good when the subscription is active and has characters, even with open invoices (A9)", async () => {
    suscripcion({})
    expect(await chequearProveedor({ proveedor: "elevenlabs", motivo: "pago", llave: LLAVE, bases: BASES })).toEqual({
      ok: true,
    })
  })

  it.each([{ status: "past_due" }, { status: "incomplete" }, { status: "free_disabled" }])(
    "stays paused on %o",
    async (cambios) => {
      suscripcion(cambios)
      expect(
        await chequearProveedor({ proveedor: "elevenlabs", motivo: "pago", llave: LLAVE, bases: BASES }),
      ).toMatchObject({ ok: false })
    },
  )

  it("stays paused for quota while no characters are left and the plan cannot extend", async () => {
    suscripcion({ character_count: 100 })
    expect(
      await chequearProveedor({ proveedor: "elevenlabs", motivo: "cuota", llave: LLAVE, bases: BASES }),
    ).toMatchObject({ ok: false })
  })

  it("stays paused on a 401 and never puts the key in the reason", async () => {
    servidor.use(http.get(`${BASES.elevenlabs}/v1/user/subscription`, () => new HttpResponse(LLAVE, { status: 401 })))
    const r = await chequearProveedor({ proveedor: "elevenlabs", motivo: "llave", llave: LLAVE, bases: BASES })
    expect(r).toMatchObject({ ok: false })
    expect(JSON.stringify(r)).not.toContain(LLAVE)
  })
})

describe("chequearProveedor heygen", () => {
  function usuario(data: Record<string, unknown>) {
    servidor.use(http.get(`${BASES.heygen}/v3/users/me`, () => HttpResponse.json({ data })))
  }
  it("is good for a key pause on any 200", async () => {
    usuario({ billing_type: "subscription", subscription: null })
    expect(await chequearProveedor({ proveedor: "heygen", motivo: "llave", llave: LLAVE, bases: BASES })).toEqual({
      ok: true,
    })
  })
  it("needs money in the API wallet for a quota pause", async () => {
    usuario({ billing_type: "wallet", wallet: { currency: "usd", remaining_balance: 0 } })
    expect(await chequearProveedor({ proveedor: "heygen", motivo: "cuota", llave: LLAVE, bases: BASES })).toMatchObject(
      { ok: false },
    )
    usuario({ billing_type: "wallet", wallet: { currency: "usd", remaining_balance: 12.5 } })
    expect(await chequearProveedor({ proveedor: "heygen", motivo: "cuota", llave: LLAVE, bases: BASES })).toEqual({
      ok: true,
    })
  })
  it("reads subscription and usage-based credits for a quota pause", async () => {
    usuario({
      billing_type: "subscription",
      subscription: { credits: { premium_credits: { remaining: 0 }, add_on_credits: { remaining: 3 } } },
    })
    expect(await chequearProveedor({ proveedor: "heygen", motivo: "cuota", llave: LLAVE, bases: BASES })).toEqual({
      ok: true,
    })
    usuario({ billing_type: "usage_based", usage_based: { remaining_credits: 0 } })
    expect(await chequearProveedor({ proveedor: "heygen", motivo: "cuota", llave: LLAVE, bases: BASES })).toMatchObject(
      { ok: false },
    )
  })
})

describe("chequearProveedor claude", () => {
  it("is good when a one-token message answers", async () => {
    let pedido: unknown
    servidor.use(
      http.post("https://api.anthropic.com/v1/messages", async ({ request }) => {
        pedido = await request.json()
        return HttpResponse.json({
          id: "msg_1",
          type: "message",
          role: "assistant",
          model: "claude-sonnet-5-5",
          content: [{ type: "text", text: "o" }],
          stop_reason: "max_tokens",
          stop_sequence: null,
          usage: { input_tokens: 8, output_tokens: 1 },
        })
      }),
    )
    expect(await chequearProveedor({ proveedor: "claude", motivo: "cuota", llave: LLAVE, bases: BASES })).toEqual({
      ok: true,
    })
    expect(pedido).toMatchObject({ model: "claude-sonnet-5-5", max_tokens: 1 })
  })
  it("stays paused while the balance is too low", async () => {
    servidor.use(
      http.post("https://api.anthropic.com/v1/messages", () =>
        HttpResponse.json(
          {
            type: "error",
            error: {
              type: "invalid_request_error",
              message: "Your credit balance is too low to access the Anthropic API.",
            },
          },
          { status: 400 },
        ),
      ),
    )
    expect(await chequearProveedor({ proveedor: "claude", motivo: "cuota", llave: LLAVE, bases: BASES })).toMatchObject(
      { ok: false },
    )
  })
})

describe("chequearProveedor voyage", () => {
  it("is good when a one-word embedding answers, and stays paused on 401", async () => {
    servidor.use(
      http.post("https://api.voyageai.com/v1/embeddings", () =>
        HttpResponse.json({
          data: [{ embedding: Array.from({ length: 1024 }, () => 0), index: 0 }],
          usage: { total_tokens: 1 },
        }),
      ),
    )
    expect(await chequearProveedor({ proveedor: "voyage", motivo: "llave", llave: LLAVE, bases: BASES })).toEqual({
      ok: true,
    })
    servidor.use(http.post("https://api.voyageai.com/v1/embeddings", () => new HttpResponse("no", { status: 401 })))
    expect(await chequearProveedor({ proveedor: "voyage", motivo: "llave", llave: LLAVE, bases: BASES })).toMatchObject(
      { ok: false },
    )
  })
})

it("stays paused when the network drops", async () => {
  servidor.use(http.get(`${BASES.heygen}/v3/users/me`, () => HttpResponse.error()))
  expect(await chequearProveedor({ proveedor: "heygen", motivo: "llave", llave: LLAVE, bases: BASES })).toMatchObject({
    ok: false,
  })
})
