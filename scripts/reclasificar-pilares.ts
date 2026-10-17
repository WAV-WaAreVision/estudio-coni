// One-off re-classification into the LinkedIn pillars (spec 2026-10-17, decision 4):
//   pnpm reclasificar:pilares <ruta.csv>             asks Claude and writes the CSV for WAV (changes nothing)
//   pnpm reclasificar:pilares <ruta.csv> --aplicar   applies the CSV WAV reviewed (calls nobody)
// Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the environment; the Anthropic key comes from the database.
import { readFileSync, writeFileSync } from "node:fs"
import Anthropic from "@anthropic-ai/sdk"
import { createClient } from "@supabase/supabase-js"
import { pilaresActivos } from "@/lib/datos/pilares"
import { aplicarReclasificacion } from "@/lib/datos/reclasificacion"
import { leerSecreto } from "@/lib/datos/repositorio"
import { exigirEnv } from "@/lib/env"
import { proponerReclasificacion } from "@/lib/pilares/proponer"
import { aCsv, leerCsv, validarFilas } from "@/lib/pilares/reclasificar"
import type { Database } from "@/lib/supabase/database.types"

async function principal(): Promise<void> {
  const [ruta, bandera] = process.argv.slice(2)
  if (!ruta) throw new Error("Uso: pnpm reclasificar:pilares <ruta.csv> [--aplicar]")
  const db = createClient<Database>(
    exigirEnv("SUPABASE_URL", process.env.SUPABASE_URL),
    exigirEnv("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY),
    { auth: { persistSession: false, autoRefreshToken: false } },
  )

  if (bandera === "--aplicar") {
    const filas = leerCsv(readFileSync(ruta, "utf-8"))
    validarFilas(filas, ["general", ...(await pilaresActivos(db)).map((p) => p.slug)])
    const { aplicadas, saltadas } = await aplicarReclasificacion(db, filas)
    console.log(`${filas.length} filas leídas; ${aplicadas} movidas.`)
    for (const s of saltadas) console.log(`Saltada ${s.id}: ${s.motivo}`)
    return
  }
  if (bandera !== undefined) throw new Error(`Opción desconocida: ${bandera}`)

  const llave = await leerSecreto(db, "anthropic")
  if (!llave) throw new Error("No hay llave de Anthropic guardada en la base.")
  const { filas, realUsd } = await proponerReclasificacion({
    db,
    claude: new Anthropic({ apiKey: llave, maxRetries: 1 }),
    ahora: new Date().toISOString(),
    avisar: (linea) => console.log(linea),
  })
  writeFileSync(ruta, aCsv(filas), "utf-8")
  console.log(`${filas.length} propuestas en ${ruta}. Costo real: US$ ${realUsd.toFixed(4)}. Nada cambió en la base.`)
}

principal().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
