import { createClient } from "@supabase/supabase-js"
import { exigirEnv } from "@/lib/env"
import type { Database } from "@/lib/supabase/database.types"
import type { DepsMetricas } from "./diarias"

/** The dependencies of the daily metrics run: a `service_role` client, because only the task writes readings. */
export function depsMetricas(): DepsMetricas {
  return {
    db: createClient<Database>(
      exigirEnv("SUPABASE_URL", process.env.SUPABASE_URL),
      exigirEnv("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY),
      { auth: { persistSession: false, autoRefreshToken: false } },
    ),
    ahora: () => new Date().toISOString(),
  }
}
