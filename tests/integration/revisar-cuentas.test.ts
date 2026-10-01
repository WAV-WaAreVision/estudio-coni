import { HttpResponse, http } from "msw"
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest"
import { revisarCuentas } from "@/lib/ajustes/revisar"
import coniConfig from "../fixtures/coni.config.json"
import { servidor } from "../msw"
import { pool } from "./db"
import { clienteDeServicio } from "./servicio"

afterAll(() => pool.end())

const AHORA = Date.parse("2026-10-01T15:00:00Z")
const DIA = 24 * 60 * 60 * 1000
const VOZ = coniConfig.elevenlabs.voice_id
const LLAVES = {
  heygen: "hg-llave-de-prueba",
  elevenlabs: "el-llave-de-prueba",
  anthropic: "sk-ant-llave-de-prueba",
  meta: "IGQ_largo",
}

async function configurarTodo() {
  for (const [nombre, valor] of Object.entries(LLAVES)) {
    await pool.query("select vault.create_secret($1, $2)", [valor, nombre])
  }
  await pool.query(
    "update public.ajustes set produccion = $1::jsonb, meta_cuenta_id = '17841405793187218', meta_token_expira_en = $2",
    [
      JSON.stringify({ ...coniConfig, elevenlabs: { ...coniConfig.elevenlabs, voice_id: VOZ } }),
      new Date(AHORA + 40 * DIA).toISOString(),
    ],
  )
}

function proveedoresResponden(cambios: { heygen?: number; anthropic?: number; voz?: number } = {}) {
  const vistas: Record<string, string | null> = {}
  servidor.use(
    http.get("https://api.heygen.com/v3/users/me", ({ request }) => {
      vistas.heygen = request.headers.get("x-api-key")
      return cambios.heygen ? new HttpResponse("x", { status: cambios.heygen }) : HttpResponse.json({ data: {} })
    }),
    http.get("https://api.anthropic.com/v1/models", ({ request }) => {
      vistas.anthropic = request.headers.get("x-api-key")
      return cambios.anthropic
        ? HttpResponse.json(
            { type: "error", error: { type: "api_error", message: "x" } },
            { status: cambios.anthropic },
          )
        : HttpResponse.json({ data: [], has_more: false })
    }),
    http.get(`https://api.elevenlabs.io/v1/voices/${VOZ}`, ({ request }) => {
      vistas.elevenlabs = request.headers.get("xi-api-key")
      return cambios.voz
        ? HttpResponse.json({ detail: "x" }, { status: cambios.voz })
        : HttpResponse.json({ name: "Coni" })
    }),
  )
  return vistas
}

const revisar = () => revisarCuentas({ servicio: clienteDeServicio(), ahora: () => AHORA })
const estados = async () => Object.fromEntries((await revisar()).map((c) => [c.cuenta, c.estado]))

beforeEach(async () => {
  await pool.query("delete from vault.secrets where name in ('heygen','elevenlabs','anthropic','meta')")
})

afterEach(async () => {
  await pool.query("delete from vault.secrets where name in ('heygen','elevenlabs','anthropic','meta')")
  await pool.query(
    "update public.ajustes set produccion = '{}'::jsonb, meta_cuenta_id = null, meta_token_expira_en = null",
  )
})

describe("revisarCuentas", () => {
  it("finds every account missing before anything is set up, and asks nobody", async () => {
    const vistas = proveedoresResponden()

    expect(await estados()).toEqual({ instagram: "falta", heygen: "falta", elevenlabs: "falta", anthropic: "falta" })
    expect(vistas).toEqual({})
  })

  it("asks each provider with Coni's own key and finds all four ready", async () => {
    await configurarTodo()
    const vistas = proveedoresResponden()

    expect(await estados()).toEqual({ instagram: "lista", heygen: "lista", elevenlabs: "lista", anthropic: "lista" })
    expect(vistas).toEqual({ heygen: LLAVES.heygen, elevenlabs: LLAVES.elevenlabs, anthropic: LLAVES.anthropic })
  })

  it("says ElevenLabs is missing while the voice is not set, even with the key", async () => {
    await configurarTodo()
    await pool.query("update public.ajustes set produccion = '{}'::jsonb")
    proveedoresResponden()

    expect((await estados()).elevenlabs).toBe("falta")
  })

  it("warns when Instagram expires within 7 days, and when it already expired", async () => {
    await configurarTodo()
    proveedoresResponden()

    await pool.query("update public.ajustes set meta_token_expira_en = $1", [new Date(AHORA + 3 * DIA).toISOString()])
    expect(await revisar()).toContainEqual({ cuenta: "instagram", estado: "vence", expiraEn: AHORA + 3 * DIA })

    await pool.query("update public.ajustes set meta_token_expira_en = $1", [new Date(AHORA - DIA).toISOString()])
    expect((await estados()).instagram).toBe("vencida")
  })

  it("does not warn about an Instagram connection with 8 days left", async () => {
    await configurarTodo()
    proveedoresResponden()
    await pool.query("update public.ajustes set meta_token_expira_en = $1", [new Date(AHORA + 8 * DIA).toISOString()])

    expect((await estados()).instagram).toBe("lista")
  })

  it("separates a key that was refused from a check that could not run", async () => {
    await configurarTodo()
    proveedoresResponden({ heygen: 401, anthropic: 500, voz: 404 })

    expect(await estados()).toEqual({
      instagram: "lista",
      heygen: "rechazada",
      elevenlabs: "rechazada",
      anthropic: "sin_respuesta",
    })
  })

  it("never returns a key", async () => {
    await configurarTodo()
    proveedoresResponden({ heygen: 401 })

    const texto = JSON.stringify(await revisar())

    for (const llave of Object.values(LLAVES)) expect(texto).not.toContain(llave)
  })
})
