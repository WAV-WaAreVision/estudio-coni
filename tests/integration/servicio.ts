import { execFileSync } from "node:child_process"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import type { Database } from "@/lib/supabase/database.types"

const Estado = z.object({ API_URL: z.string().url(), SERVICE_ROLE_KEY: z.string().min(1) })

let memo: { url: string; clave: string } | undefined

/**
 * URL and service-role key of the local stack: from SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY when set, otherwise
 * from `supabase status`. Local development keys only; they never leave the machine and are not committed.
 */
export function credencialesDeServicio(): { url: string; clave: string } {
  const url = process.env.SUPABASE_URL
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (url && clave) return { url, clave }
  if (!memo) {
    let salida: string
    try {
      salida = execFileSync("supabase", ["status", "-o", "json"], {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
      })
    } catch (error) {
      throw new Error("No pude leer las llaves del Supabase local. ¿Está corriendo? Prueba con `pnpm db:start`.", {
        cause: error,
      })
    }
    const estado = Estado.parse(JSON.parse(salida))
    memo = { url: estado.API_URL, clave: estado.SERVICE_ROLE_KEY }
  }
  return memo
}

/** A client that talks to the local stack as `service_role`, like the Trigger.dev tasks do. */
export function clienteDeServicio(): SupabaseClient<Database> {
  const { url, clave } = credencialesDeServicio()
  return createClient<Database>(url, clave, { auth: { persistSession: false, autoRefreshToken: false } })
}
