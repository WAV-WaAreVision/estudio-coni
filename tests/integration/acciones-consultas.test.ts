import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { anotarConsulta, deshacerConsulta } from "@/lib/acciones/consultas"
import type { Database } from "@/lib/supabase/database.types"
import { pool } from "./db"
import { clienteDeConi, clienteDelMantenedor } from "./sesion-coni"

type Db = SupabaseClient<Database>

let coni: Db
let mantenedor: Db

// The database stamps the tap with its own clock, so the action's clock is the real one and the seeded rows are placed
// relative to the start of the current month in Santiago.
const deps = (db: Db) => ({ db, ahora: () => new Date().toISOString() })
const INICIO_DEL_MES = "date_trunc('month', now() at time zone 'America/Santiago') at time zone 'America/Santiago'"

async function total(): Promise<number> {
  const { rows } = await pool.query<{ n: string }>("select count(*) as n from public.consultas")
  return Number(rows[0]?.n)
}

beforeAll(async () => {
  coni = await clienteDeConi()
  mantenedor = await clienteDelMantenedor()
})

beforeEach(async () => {
  await pool.query("delete from public.consultas")
})

afterAll(async () => {
  await pool.query("delete from public.consultas")
  await pool.end()
})

describe("anotarConsulta", () => {
  it("notes one consultation and answers with the month's total, counting the ones noted earlier", async () => {
    await pool.query(
      `insert into public.consultas (anotada_en) values (${INICIO_DEL_MES} + interval '1 minute'), (${INICIO_DEL_MES} - interval '1 hour')`,
    )

    const resultado = await anotarConsulta(deps(coni))

    expect(resultado).toMatchObject({ ok: true, totalDelMes: 2 })
    expect(await total()).toBe(3)
  })

  it("answers with an id that undoes exactly that tap", async () => {
    const resultado = await anotarConsulta(deps(coni))
    if (!resultado.ok) throw new Error(resultado.error)

    const deshecho = await deshacerConsulta(deps(coni), resultado.id)

    expect(deshecho).toMatchObject({ ok: true, totalDelMes: 0 })
    expect(await total()).toBe(0)
  })

  it("does not let the maintainer note one, and says so without technical words", async () => {
    const resultado = await anotarConsulta(deps(mantenedor))

    expect(resultado).toEqual({ ok: false, error: "Algo falló de nuestro lado. Inténtalo de nuevo en unos minutos." })
    expect(await total()).toBe(0)
  })
})

describe("deshacerConsulta", () => {
  it("tells her when there was nothing to undo", async () => {
    const resultado = await deshacerConsulta(deps(coni), "00000000-0000-4000-8000-000000000000")

    expect(resultado).toEqual({ ok: false, error: "Esa consulta ya no está." })
  })

  it("leaves a consultation from an earlier day alone", async () => {
    const { rows } = await pool.query<{ id: string }>(
      "insert into public.consultas (anotada_en) values (now() - interval '3 days') returning id",
    )

    const resultado = await deshacerConsulta(deps(coni), rows[0]?.id ?? "")

    expect(resultado.ok).toBe(false)
    expect(await total()).toBe(1)
  })
})
