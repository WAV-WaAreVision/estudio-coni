import Anthropic from "@anthropic-ai/sdk"
import { createClient } from "@supabase/supabase-js"
import { leerSecreto } from "@/lib/datos/repositorio"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import { exigirEnv } from "@/lib/env"
import { almacenReal } from "@/lib/proveedores/almacen"
import type { Database } from "@/lib/supabase/database.types"
import type { DepsProduccion } from "./producir"

// Three calls of at most two attempts each must fit in the task's 900 s (trigger.config.ts), unlike the SDK's
// default of 10 minutes and two retries, where one hung call would end the run.
const CLAUDE_ESPERA_MS = 120_000

/** The dependencies of a Trigger.dev run. Cheap checks come first, so a missing setting fails before any spend. */
export async function depsReales(): Promise<DepsProduccion> {
  const url = exigirEnv("SUPABASE_URL", process.env.SUPABASE_URL)
  const claveDeServicio = exigirEnv("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY)
  const almacen = almacenReal()
  const db = createClient<Database>(url, claveDeServicio, { auth: { persistSession: false, autoRefreshToken: false } })
  const llaveDeAnthropic = await leerSecreto(db, "anthropic")
  if (!llaveDeAnthropic) {
    throw new FallaDeConfiguracion("Coni todavía no ingresó su llave de Anthropic en Ajustes.")
  }
  return {
    db,
    claude: new Anthropic({ apiKey: llaveDeAnthropic, timeout: CLAUDE_ESPERA_MS, maxRetries: 1 }),
    almacen,
    ahora: () => new Date().toISOString(),
  }
}
