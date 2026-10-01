// One-off import of the idea bank (plan T16): pnpm importar:banco <ruta a banco.md>
// Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the environment; it writes as service_role.
import { readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"
import { exigirEnv } from "@/lib/env"
import { parsearBanco } from "@/lib/ideas/banco"
import { importarIdeas } from "@/lib/ideas/importar"
import type { Database } from "@/lib/supabase/database.types"

async function principal(): Promise<void> {
  const ruta = process.argv[2]
  if (!ruta) throw new Error("Uso: pnpm importar:banco <ruta a contenido/ideas/banco.md>")

  const ideas = parsearBanco(readFileSync(ruta, "utf-8"))
  const db = createClient<Database>(
    exigirEnv("SUPABASE_URL", process.env.SUPABASE_URL),
    exigirEnv("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY),
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  const { leidas } = await importarIdeas(db, ideas)
  const { count, error } = await db.from("ideas").select("id", { count: "exact", head: true })
  if (error) throw new Error(`No pude contar las ideas de la base: ${error.message}`, { cause: error })
  console.log(`${leidas} ideas leídas del archivo; la base tiene ${count} ideas.`)
}

principal().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
