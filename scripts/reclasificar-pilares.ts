// One-off re-classification into the LinkedIn pillars (spec 2026-10-17, decision 4):
//   pnpm reclasificar:pilares <ruta.csv>             asks Claude and writes a new CSV for WAV (changes nothing)
//   pnpm reclasificar:pilares <ruta.csv> --aplicar   applies the CSV WAV reviewed (calls nobody)
// Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the environment; the Anthropic key comes from the database.
import Anthropic from "@anthropic-ai/sdk"
import { createClient } from "@supabase/supabase-js"
import { leerSecreto } from "@/lib/datos/repositorio"
import { exigirEnv } from "@/lib/env"
import { ejecutarReclasificacion } from "@/lib/pilares/ejecutar"
import type { Database } from "@/lib/supabase/database.types"

const db = createClient<Database>(
  exigirEnv("SUPABASE_URL", process.env.SUPABASE_URL),
  exigirEnv("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY),
  { auth: { persistSession: false, autoRefreshToken: false } },
)

ejecutarReclasificacion(process.argv.slice(2), {
  db,
  leerLlave: () => leerSecreto(db, "anthropic"),
  crearClaude: (llave) => new Anthropic({ apiKey: llave, maxRetries: 1 }),
  ahora: () => new Date().toISOString(),
  avisar: (linea) => console.log(linea),
}).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
