import { existsSync, readFileSync, writeFileSync } from "node:fs"
import type Anthropic from "@anthropic-ai/sdk"
import type { SupabaseClient } from "@supabase/supabase-js"
import { leerPilares } from "@/lib/datos/pilares"
import {
  aplicarLoteDePilares,
  deshacerLoteDePilares,
  leerIdeasEnPilaresSinRed,
  leerTemasSinPilaresDeRed,
} from "@/lib/datos/pilares-por-red"
import { confirmarGasto, reservarGastoGeneral } from "@/lib/datos/repositorio"
import { costoClaude, proponerPilaresPorRed } from "@/lib/proveedores/anthropic"
import type { Database } from "@/lib/supabase/database.types"
import {
  aCsvPorRed,
  aMarkdownParaConi,
  estimarPropuestaPorRed,
  filasDelLote,
  filasDePropuesta,
  LOTE_PILARES_POR_RED,
  leerCsvPorRed,
} from "./por-red"
import { cerrarGastoTrasFalla } from "./proponer"

export interface DepsPilaresPorRed {
  db: SupabaseClient<Database>
  leerLlave: () => Promise<string | null>
  crearClaude: (llave: string) => Anthropic
  ahora: () => string
  avisar: (linea: string) => void
}

const USO = "Uso: pnpm pilares:proponer <ruta sin extensión> · pnpm pilares:aplicar <ruta.csv> · pnpm pilares:deshacer"

/** What `scripts/pilares-por-red.ts` does (spec 2026-11-04, section 3), with its outside world passed in. */
export async function ejecutarPilaresPorRed(argumentos: readonly string[], deps: DepsPilaresPorRed): Promise<void> {
  const [orden, ruta, ...resto] = argumentos
  if (resto.length > 0) throw new Error(USO)
  if (orden === "proponer" && ruta) return proponer(ruta, deps)
  if (orden === "aplicar" && ruta) return aplicar(ruta, deps)
  if (orden === "deshacer" && ruta === undefined) return deshacer(deps)
  throw new Error(USO)
}

/** Claude proposes; nothing is written to topics or ideas. The spend goes through the month's limit. */
async function proponer(base: string, deps: DepsPilaresPorRed): Promise<void> {
  const csv = `${base}.csv`
  const md = `${base}.md`
  // Checked before spending anything; `wx` below still refuses a file that appears while Claude answers.
  for (const ruta of [csv, md]) {
    if (existsSync(ruta)) throw new Error(`Ya existe ${ruta}: no lo piso. Elige otra ruta.`)
  }
  const [catalogo, temas, ideas] = await Promise.all([
    leerPilares(deps.db),
    leerTemasSinPilaresDeRed(deps.db),
    leerIdeasEnPilaresSinRed(deps.db),
  ])
  if (temas.length === 0 && ideas.length === 0) {
    deps.avisar("No hay temas sin pilares ni ideas del banco en pilares anteriores: nada que proponer.")
    return
  }
  // Claude reads neither the old category nor the old pillar: the proposal starts from the topic itself.
  const paraClaude = {
    temas: temas.map(({ id, nombre, descripcion, ideas: deTema }) => ({ id, nombre, descripcion, ideas: deTema })),
    ideas: ideas.map(({ id, gancho, tema }) => ({ id, gancho, tema })),
  }
  const estimadoUsd = estimarPropuestaPorRed({ pilares: catalogo, ...paraClaude })
  deps.avisar(
    `Voy a proponer pilares para ${temas.length} temas y ${ideas.length} ideas. Costo estimado: US$ ${estimadoUsd.toFixed(4)}.`,
  )
  const llave = await deps.leerLlave()
  if (!llave) throw new Error("No hay llave de Anthropic guardada en la base.")

  const clave = `pilares_por_red:${crypto.randomUUID()}`
  const reserva = await reservarGastoGeneral(deps.db, {
    proveedor: "anthropic",
    paso: "pilares_por_red",
    estimadoUsd,
    clave,
    ahora: deps.ahora(),
  })
  if (reserva.limite) {
    throw new Error("El límite del mes no alcanza para la propuesta. Reactívalo en Ajustes o espera al próximo mes.")
  }
  let propuesta: Awaited<ReturnType<typeof proponerPilaresPorRed>>
  try {
    propuesta = await proponerPilaresPorRed({ cliente: deps.crearClaude(llave), pilares: catalogo, ...paraClaude })
  } catch (error) {
    // One call: if it failed, nothing was billed.
    await cerrarGastoTrasFalla(deps, clave, 0)
    throw error
  }
  const realUsd = costoClaude(propuesta.uso, propuesta.modelo)
  await confirmarGasto(deps.db, clave, Number(realUsd.toFixed(4)))

  const filas = filasDePropuesta(temas, ideas, propuesta)
  writeFileSync(csv, aCsvPorRed(filas), { encoding: "utf-8", flag: "wx" })
  writeFileSync(md, aMarkdownParaConi(filas, catalogo), { encoding: "utf-8", flag: "wx" })
  deps.avisar(
    `Propuesta en ${csv} (para aplicar) y ${md} (para Coni). Costo real: US$ ${realUsd.toFixed(4)}. Nada cambió en los temas ni en las ideas.`,
  )
}

/** Applies the reviewed CSV in one transaction. Rewrites production data: run it only with Federico's OK. */
async function aplicar(ruta: string, deps: DepsPilaresPorRed): Promise<void> {
  const filas = leerCsvPorRed(readFileSync(ruta, "utf-8"))
  const lote = filasDelLote(filas, await leerPilares(deps.db))
  // The RPC refuses it too (`lote_vacio`); refused here, an empty CSV never reaches the database.
  if (lote.temas.length === 0) throw new Error("El CSV no trae ningún tema: no hay nada que aplicar.")
  const resumen = await aplicarLoteDePilares(deps.db, LOTE_PILARES_POR_RED, lote)
  deps.avisar(
    `Lote ${LOTE_PILARES_POR_RED} aplicado: ${resumen.filas} pilares en ${lote.temas.length} temas, ${resumen.ideas} ideas movidas, ${resumen.retirados} pilares anteriores retirados. Para volver atrás: pnpm pilares:deshacer.`,
  )
}

async function deshacer(deps: DepsPilaresPorRed): Promise<void> {
  const resumen = await deshacerLoteDePilares(deps.db, LOTE_PILARES_POR_RED)
  deps.avisar(
    `Lote ${LOTE_PILARES_POR_RED} deshecho: ${resumen.filas} pilares de temas borrados, ${resumen.ideas} ideas de vuelta en su pilar, ${resumen.reactivados} pilares anteriores reactivados.`,
  )
}
