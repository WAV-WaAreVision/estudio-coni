import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import pg from "pg"
import type { Database } from "@/lib/supabase/database.types"
import { exigirBaseLocal } from "./base-local"

export const URL_DB = exigirBaseLocal(
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres",
)

// The well-known demo keys of the local Supabase stack, not a secret.
const URL_API = exigirBaseLocal(process.env.SUPABASE_URL ?? "http://127.0.0.1:54421")
const LLAVE_DE_SERVICIO_LOCAL =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"

/** A supabase-js client as `service_role` against the local stack, for code that takes a `Db`. */
export function clienteSupabaseDeServicio(): SupabaseClient<Database> {
  return createClient<Database>(URL_API, LLAVE_DE_SERVICIO_LOCAL, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export const CONI = "c0000000-0000-4000-8000-000000000001"
export const MANTENEDOR = "a0000000-0000-4000-8000-000000000002"
export const OTRA = "b0000000-0000-4000-8000-000000000003"

export type Sesion = { tipo: "usuario"; id: string } | { tipo: "servicio" } | { tipo: "postgres" }

export const comoConi: Sesion = { tipo: "usuario", id: CONI }
export const comoMantenedor: Sesion = { tipo: "usuario", id: MANTENEDOR }
export const comoOtra: Sesion = { tipo: "usuario", id: OTRA }
export const comoServicio: Sesion = { tipo: "servicio" }
export const comoPostgres: Sesion = { tipo: "postgres" }

export const pool = new pg.Pool({ connectionString: URL_DB, max: 4 })

/** Back to the default limit, twice the cap: no reactivated month and no limit of her own. */
export async function sinLimiteFijado(): Promise<void> {
  await pool.query("delete from public.limites_del_mes")
  await pool.query("update public.ajustes set limite_duro_usd = null")
}

/** Impersonates an actor the way PostgREST does, for the current transaction only. */
export async function asumir(cliente: pg.PoolClient, sesion: Sesion): Promise<void> {
  // Reset first so a test can switch actor in the middle of a transaction (also back to postgres).
  await cliente.query("reset role")
  await cliente.query("select set_config('request.jwt.claims', '', true)")
  if (sesion.tipo === "postgres") return
  const claims = sesion.tipo === "usuario" ? { sub: sesion.id, role: "authenticated" } : { role: "service_role" }
  await cliente.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)])
  await cliente.query(`set local role ${sesion.tipo === "usuario" ? "authenticated" : "service_role"}`)
}

/** Runs `fn` as `sesion` inside a transaction that is always rolled back, so tests leave no data behind. */
export async function como<T>(sesion: Sesion, fn: (cliente: pg.PoolClient) => Promise<T>): Promise<T> {
  const cliente = await pool.connect()
  try {
    await cliente.query("begin")
    await asumir(cliente, sesion)
    return await fn(cliente)
  } finally {
    await cliente.query("rollback")
    cliente.release()
  }
}

/** Runs a statement that must fail and returns the error; a savepoint keeps the transaction usable afterwards. */
export async function fallaCon(cliente: pg.PoolClient, sql: string, params: unknown[] = []): Promise<pg.DatabaseError> {
  await cliente.query("savepoint intento")
  try {
    await cliente.query(sql, params)
  } catch (error) {
    await cliente.query("rollback to savepoint intento")
    if (error instanceof pg.DatabaseError) return error
    throw error
  }
  throw new Error(`Se esperaba un error y la consulta tuvo éxito: ${sql}`)
}
