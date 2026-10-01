// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import { depsReales } from "@/lib/produccion/deps-reales"

const ANTES = { url: process.env.SUPABASE_URL, clave: process.env.SUPABASE_SERVICE_ROLE_KEY }

beforeEach(() => {
  delete process.env.SUPABASE_URL
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
})

afterEach(() => {
  for (const [nombre, valor] of [
    ["SUPABASE_URL", ANTES.url],
    ["SUPABASE_SERVICE_ROLE_KEY", ANTES.clave],
  ] as const) {
    if (valor === undefined) delete process.env[nombre]
    else process.env[nombre] = valor
  }
})

describe("depsReales", () => {
  it("names the missing variable when the Supabase URL is not set", async () => {
    await expect(depsReales()).rejects.toThrow("SUPABASE_URL")
  })

  it("names the missing variable when the service key is not set", async () => {
    process.env.SUPABASE_URL = "http://127.0.0.1:1"
    await expect(depsReales()).rejects.toThrow("SUPABASE_SERVICE_ROLE_KEY")
  })

  it("fails as a configuration error before touching the network while the R2 store does not exist (Plan 3b)", async () => {
    process.env.SUPABASE_URL = "http://127.0.0.1:1"
    process.env.SUPABASE_SERVICE_ROLE_KEY = "clave-de-prueba"
    const error = await depsReales().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(FallaDeConfiguracion)
    expect(error).toMatchObject({ message: expect.stringContaining("R2") })
  })
})
