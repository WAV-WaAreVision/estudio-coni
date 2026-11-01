import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { reactivarLimite } from "@/lib/acciones/presupuesto"
import type { Database } from "@/lib/supabase/database.types"
import { pool } from "./db"
import { clienteDeConi, clienteDelMantenedor } from "./sesion-coni"

let coni: SupabaseClient<Database>
let mantenedor: SupabaseClient<Database>

const MES = "date_trunc('month', now() at time zone 'America/Santiago')::date"

beforeAll(async () => {
  coni = await clienteDeConi()
  mantenedor = await clienteDelMantenedor()
})

afterEach(async () => {
  vi.restoreAllMocks()
  await pool.query("delete from public.limites_del_mes")
  await pool.query("delete from public.gastos where paso = 'prueba_presupuesto'")
})

afterAll(() => pool.end())

async function gastado(usd: number): Promise<void> {
  await pool.query(
    `insert into public.gastos (proveedor, paso, mes, estimado_usd, real_usd, estado, clave) values ('heygen', 'prueba_presupuesto', ${MES}, $1, $1, 'confirmado', 'prueba-presupuesto-1')`,
    [usd],
  )
}

async function limiteGuardado(): Promise<number | null> {
  const { rows } = await pool.query<{ limite: number }>(
    `select limite_usd::float8 as limite from public.limites_del_mes where mes = ${MES}`,
  )
  return rows[0]?.limite ?? null
}

describe("reactivarLimite", () => {
  it("sets this month's limit and answers with it", async () => {
    expect(await reactivarLimite(coni, { limite: 120 })).toEqual({ ok: true, limite: 120 })
    expect(await limiteGuardado()).toBe(120)
  })

  it("explains in plain Spanish a limit that does not cover what she spent, and saves nothing", async () => {
    await gastado(90)

    expect(await reactivarLimite(coni, { limite: 85 })).toEqual({
      ok: false,
      error: "Ese límite no alcanza: ya gastaste US$ 90,00 este mes. Elige uno mayor.",
    })
    expect(await limiteGuardado()).toBeNull()
  })

  it("asks for dollars when what she wrote is not an amount", async () => {
    expect(await reactivarLimite(coni, { limite: -5 })).toEqual({
      ok: false,
      error: "Escribe tu límite en dólares, por ejemplo 120.",
    })
  })

  it("refuses a limit above US$ 1.000 before it asks the database", async () => {
    expect(await reactivarLimite(coni, { limite: 1500 })).toEqual({
      ok: false,
      error: "El límite no puede pasar de US$ 1.000.",
    })
    expect(await limiteGuardado()).toBeNull()
  })

  it("explains a limit under her cap with the cap", async () => {
    expect(await reactivarLimite(coni, { limite: 35 })).toEqual({
      ok: false,
      error: "Tu límite no puede ser menor que tu tope de US$ 40,00.",
    })
    expect(await limiteGuardado()).toBeNull()
  })

  it("rounds the limit to cents", async () => {
    expect(await reactivarLimite(coni, { limite: 120.456 })).toEqual({ ok: true, limite: 120.46 })
    expect(await limiteGuardado()).toBe(120.46)
  })

  it("does not let WAV reactivate the month", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)

    expect(await reactivarLimite(mantenedor, { limite: 120 })).toMatchObject({ ok: false })
    expect(await limiteGuardado()).toBeNull()
  })
})
