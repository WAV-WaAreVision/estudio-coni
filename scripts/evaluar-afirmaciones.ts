// Calibration of claims and topics (C1 plan, Task 10). Read-only: it never writes to the database.
//   pnpm tsx scripts/evaluar-afirmaciones.ts <materialId...> --tramos N [--confirmar]
// Without --confirmar it only prints the estimated spend. Credentials come from the environment, like the Trigger.dev
// tasks: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, R2_* and VOYAGE_API_KEY; the Anthropic key is read from Vault
// (`leer_secreto`) and only after --confirmar.
import Anthropic from "@anthropic-ai/sdk"
import { createClient } from "@supabase/supabase-js"
import { z } from "zod"
import { leerSecreto } from "@/lib/datos/repositorio"
import { exigirEnv } from "@/lib/env"
import { agruparPorSimilitud } from "@/lib/ingesta/agrupar"
import {
  contarPor,
  estimarGastoDeCalibracion,
  gruposGrandes,
  muestraAleatoria,
  resumirGrupos,
  tasaDeSupervivencia,
} from "@/lib/ingesta/calibracion"
import { Parte } from "@/lib/ingesta/partes"
import { aTramos } from "@/lib/ingesta/tramos"
import { almacenReal } from "@/lib/proveedores/almacen"
import {
  type AfirmacionExtraida,
  costoClaude,
  extraerAfirmaciones,
  MAXIMO_AFIRMACIONES_POR_TRAMO,
  MODELO_POR_TAREA,
} from "@/lib/proveedores/anthropic"
import { costoVoyage, embeber } from "@/lib/proveedores/voyage"
import type { Database } from "@/lib/supabase/database.types"

const UMBRALES = [0.75, 0.8, 0.85]
const MUESTRA = 20
const TEXTOS_POR_EMBEBIDO = 128
const TOKENS_POR_AFIRMACION = 100
// Same reservation as lib/ingesta/afirmar.ts (ESTIMADO_POR_TRAMO_USD): over-estimates on purpose.
const USD_POR_TRAMO = costoClaude(
  { input_tokens: 5_000, output_tokens: 1_500 },
  MODELO_POR_TAREA.extraerAfirmaciones.modelo,
)

const Extraccion = z.object({ partes: z.array(Parte) })

function leerArgumentos(argv: readonly string[]): { ids: string[]; tramos: number; confirmar: boolean } {
  const ids: string[] = []
  let tramos = 0
  let confirmar = false
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--confirmar") confirmar = true
    else if (a === "--tramos") tramos = Number(argv[++i])
    else if (a && !a.startsWith("--")) ids.push(a)
  }
  if (ids.length === 0 || !Number.isInteger(tramos) || tramos < 1) {
    throw new Error("Uso: pnpm tsx scripts/evaluar-afirmaciones.ts <materialId...> --tramos N [--confirmar]")
  }
  return { ids, tramos, confirmar }
}

async function principal(): Promise<void> {
  const { ids, tramos: maximoDeTramos, confirmar } = leerArgumentos(process.argv.slice(2))
  const db = createClient<Database>(
    exigirEnv("SUPABASE_URL", process.env.SUPABASE_URL),
    exigirEnv("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY),
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  const almacen = almacenReal()

  const materiales = []
  for (const id of ids) {
    const { data: material, error } = await db.from("materiales").select("id, autor_id").eq("id", id).single()
    if (error) throw new Error(`No pude leer el material ${id}: ${error.message}`, { cause: error })
    const { data: autor, error: errorAutor } = await db
      .from("autores")
      .select("nombre, credencial")
      .eq("id", material.autor_id)
      .single()
    if (errorAutor) throw new Error(`No pude leer el autor de ${id}: ${errorAutor.message}`, { cause: errorAutor })
    const bytes = await almacen.bajar(`materiales/${id}/partes-original.json`)
    const { partes } = Extraccion.parse(JSON.parse(new TextDecoder().decode(bytes)))
    materiales.push({ id, autor, tramos: aTramos(partes).slice(0, maximoDeTramos) })
  }

  const totalDeTramos = materiales.reduce((n, m) => n + m.tramos.length, 0)
  const usdEmbeddings = costoVoyage(totalDeTramos * MAXIMO_AFIRMACIONES_POR_TRAMO * TOKENS_POR_AFIRMACION)
  const estimado = estimarGastoDeCalibracion({ tramos: totalDeTramos, usdPorTramo: USD_POR_TRAMO, usdEmbeddings })
  console.log(`${materiales.length} materiales, ${totalDeTramos} tramos.`)
  console.log(`Gasto estimado (techo): US$ ${estimado.toFixed(2)}.`)
  if (!confirmar) {
    console.log("No llamé a ninguna API. Agrega --confirmar para ejecutar.")
    return
  }

  const claveVoyage = exigirEnv("VOYAGE_API_KEY", process.env.VOYAGE_API_KEY)
  const claveClaude = await leerSecreto(db, "anthropic")
  if (!claveClaude) throw new Error("Falta la llave de Anthropic en Vault (secreto `anthropic`).")
  const claude = new Anthropic({ apiKey: claveClaude, timeout: 120_000, maxRetries: 1 })

  const afirmaciones: (AfirmacionExtraida & { id: string })[] = []
  let propuestas = 0
  let usdClaude = 0
  for (const material of materiales) {
    for (const tramo of material.tramos) {
      const r = await extraerAfirmaciones({ cliente: claude, tramo, autor: material.autor })
      propuestas += r.propuestas
      usdClaude += costoClaude(r.uso, MODELO_POR_TAREA.extraerAfirmaciones.modelo)
      for (const a of r.afirmaciones) afirmaciones.push({ ...a, id: String(afirmaciones.length).padStart(5, "0") })
    }
  }

  const vectores: number[][] = []
  let tokensVoyage = 0
  for (let desde = 0; desde < afirmaciones.length; desde += TEXTOS_POR_EMBEBIDO) {
    const lote = afirmaciones.slice(desde, desde + TEXTOS_POR_EMBEBIDO).map((a) => a.texto)
    const r = await embeber({ clave: claveVoyage, textos: lote, tipo: "document" })
    vectores.push(...r.vectores)
    tokensVoyage += r.tokens
  }

  const tasa = tasaDeSupervivencia(propuestas, afirmaciones.length)
  console.log("\n== Extracción ==")
  console.log(`Propuestas: ${propuestas}; con cita literal: ${afirmaciones.length}`)
  console.log(`Supervivencia de la cita literal: ${tasa === null ? "n/a" : `${(tasa * 100).toFixed(1)}%`}`)
  console.log(`Afirmaciones por tramo: ${(afirmaciones.length / Math.max(totalDeTramos, 1)).toFixed(1)}`)
  console.log(
    "Por tipo:",
    contarPor(afirmaciones, (a) => a.tipo),
  )
  console.log(
    "Por evidencia:",
    contarPor(afirmaciones, (a) => a.evidencia),
  )
  console.log(`Gasto real: Claude US$ ${usdClaude.toFixed(3)}, Voyage US$ ${costoVoyage(tokensVoyage).toFixed(4)}`)

  console.log(`\n== ${MUESTRA} afirmaciones al azar ==`)
  for (const a of muestraAleatoria(afirmaciones, MUESTRA, Math.random)) {
    console.log(`- [${a.tipo}/${a.evidencia}] ${a.texto}\n    cita: "${a.cita}"`)
  }

  const items = afirmaciones.map((a, i) => ({ id: a.id, vector: vectores[i] ?? [] }))
  const textoDe = new Map(afirmaciones.map((a) => [a.id, a.texto]))
  for (const umbral of UMBRALES) {
    const grupos = agruparPorSimilitud(items, umbral)
    console.log(`\n== Umbral ${umbral}: ${JSON.stringify(resumirGrupos(grupos))} ==`)
    for (const grupo of gruposGrandes(grupos, 3)) {
      console.log(`\nGrupo de ${grupo.length}:`)
      for (const id of grupo) console.log(`  - ${textoDe.get(id)}`)
    }
  }
}

principal().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
