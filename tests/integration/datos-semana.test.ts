import { randomUUID } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { leerCostosDelMotor } from "@/lib/datos/semana"
import type { Database } from "@/lib/supabase/database.types"
import { pool } from "./db"
import { clienteDeConi } from "./sesion-coni"
import { vaciarMotor } from "./siembra"
import { borrarSembrado } from "./siembra-biblioteca"

const SUFIJO = randomUUID().slice(0, 8)

let coni: SupabaseClient<Database>
const temas: string[] = []

interface CamposDeCorrida {
  estado?: "corriendo" | "lista" | "fallida"
  costo?: number
  resumen?: unknown
  motivo?: string | null
}

/** As postgres: only the service role writes runs from the app. */
async function corrida(semana: string, campos: CamposDeCorrida = {}): Promise<void> {
  await pool.query(
    "insert into public.motor_corridas (semana, estado, costo_usd, resumen, motivo_fallo) values ($1, $2, $3, $4::jsonb, $5)",
    [semana, campos.estado ?? "lista", campos.costo ?? 0, JSON.stringify(campos.resumen ?? {}), campos.motivo ?? null],
  )
}

/** The engine's runs and theories, and the manual theories this file wrote (vaciarMotor leaves those). */
async function limpiar(): Promise<void> {
  await vaciarMotor()
  await pool.query("delete from public.teorias where titulo like $1", [`%${SUFIJO}`])
}

beforeAll(async () => {
  coni = await clienteDeConi()
})

beforeEach(limpiar)

afterAll(async () => {
  await limpiar()
  await borrarSembrado([], temas, [])
  await pool.end()
})

describe("leerCostosDelMotor", () => {
  it("reads the cost of the latest four runs that cost something, newest first", async () => {
    await corrida("2026-10-04", { costo: 0.4 })
    await corrida("2026-10-11", { costo: 0.3 })
    await corrida("2026-10-18", { costo: 0, estado: "fallida", motivo: "x" })
    await corrida("2026-10-25", { costo: 0.25 })
    await corrida("2026-11-01", { costo: 0.2 })
    await corrida("2026-11-08", { costo: 0.21 })
    expect(await leerCostosDelMotor(coni)).toEqual([0.21, 0.2, 0.25, 0.3])
  })

  it("reads nothing before any run", async () => {
    expect(await leerCostosDelMotor(coni)).toEqual([])
  })
})
