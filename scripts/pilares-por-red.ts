// The reclassification into pillars per network (spec 2026-11-04, part 15a, section 3):
//   pnpm pilares:proponer <ruta sin extensión>   asks Claude, writes <ruta>.csv and <ruta>.md (changes nothing)
//   pnpm pilares:aplicar <ruta.csv>              applies the reviewed CSV as lot pilares-por-red-2026-11 (calls nobody)
//   pnpm pilares:deshacer                        undoes that lot
// Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the environment; the Anthropic key comes from the database.
import Anthropic from "@anthropic-ai/sdk"
import { createClient } from "@supabase/supabase-js"
import { leerSecreto } from "@/lib/datos/repositorio"
import { exigirEnv } from "@/lib/env"
import { ejecutarPilaresPorRed } from "@/lib/pilares/ejecutar-por-red"
import type { Database } from "@/lib/supabase/database.types"

const db = createClient<Database>(
  exigirEnv("SUPABASE_URL", process.env.SUPABASE_URL),
  exigirEnv("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY),
  { auth: { persistSession: false, autoRefreshToken: false } },
)

ejecutarPilaresPorRed(process.argv.slice(2), {
  db,
  leerLlave: () => leerSecreto(db, "anthropic"),
  crearClaude: (llave) => new Anthropic({ apiKey: llave, maxRetries: 1 }),
  ahora: () => new Date().toISOString(),
  avisar: (linea) => console.log(linea),
}).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
