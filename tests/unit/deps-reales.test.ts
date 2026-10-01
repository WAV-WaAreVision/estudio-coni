// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { depsReales } from "@/lib/produccion/deps-reales"

const VARIABLES = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "R2_ACCOUNT_ID"] as const
const ANTES = Object.fromEntries(VARIABLES.map((nombre) => [nombre, process.env[nombre]]))

beforeEach(() => {
  for (const nombre of VARIABLES) delete process.env[nombre]
})

afterEach(() => {
  for (const nombre of VARIABLES) {
    const valor = ANTES[nombre]
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

  it("names the missing R2 variable before touching the network", async () => {
    process.env.SUPABASE_URL = "http://127.0.0.1:1"
    process.env.SUPABASE_SERVICE_ROLE_KEY = "clave-de-prueba"
    await expect(depsReales()).rejects.toThrow("R2_ACCOUNT_ID")
  })
})
