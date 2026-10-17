import { existsSync, readFileSync, writeFileSync } from "node:fs"
import type Anthropic from "@anthropic-ai/sdk"
import type { SupabaseClient } from "@supabase/supabase-js"
import { pilaresActivos } from "@/lib/datos/pilares"
import { aplicarReclasificacion } from "@/lib/datos/reclasificacion"
import type { Database } from "@/lib/supabase/database.types"
import { proponerReclasificacion } from "./proponer"
import { aCsv, leerCsv, validarFilas } from "./reclasificar"

/** What `scripts/reclasificar-pilares.ts` does, with its outside world passed in so tests can count it. */
export async function ejecutarReclasificacion(
  argumentos: readonly string[],
  deps: {
    db: SupabaseClient<Database>
    leerLlave: () => Promise<string | null>
    crearClaude: (llave: string) => Anthropic
    ahora: () => string
    avisar: (linea: string) => void
  },
): Promise<void> {
  const [ruta, bandera] = argumentos
  if (!ruta) throw new Error("Uso: pnpm reclasificar:pilares <ruta.csv> [--aplicar]")

  if (bandera === "--aplicar") {
    const filas = leerCsv(readFileSync(ruta, "utf-8"))
    validarFilas(filas, ["general", ...(await pilaresActivos(deps.db)).map((p) => p.slug)])
    const { aplicadas, saltadas } = await aplicarReclasificacion(deps.db, filas)
    deps.avisar(`${filas.length} filas leídas; ${aplicadas} movidas.`)
    for (const s of saltadas) deps.avisar(`Saltada ${s.id}: ${s.motivo}`)
    return
  }
  if (bandera !== undefined) throw new Error(`Opción desconocida: ${bandera}`)

  // Checked before spending anything; `wx` below still refuses a file that appears while Claude answers.
  if (existsSync(ruta)) throw new Error(`Ya existe ${ruta}: no lo piso. Elige otra ruta.`)
  const llave = await deps.leerLlave()
  if (!llave) throw new Error("No hay llave de Anthropic guardada en la base.")
  const { filas, realUsd } = await proponerReclasificacion({
    db: deps.db,
    claude: deps.crearClaude(llave),
    ahora: deps.ahora(),
    avisar: deps.avisar,
  })
  writeFileSync(ruta, aCsv(filas), { encoding: "utf-8", flag: "wx" })
  deps.avisar(`${filas.length} propuestas en ${ruta}. Costo real: US$ ${realUsd.toFixed(4)}. Nada cambió en la base.`)
}
