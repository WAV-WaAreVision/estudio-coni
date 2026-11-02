import type Anthropic from "@anthropic-ai/sdk"
import type { SupabaseClient } from "@supabase/supabase-js"
import { pilaresActivos } from "@/lib/datos/pilares"
import { leerElementosPorReclasificar } from "@/lib/datos/reclasificacion"
import { confirmarGasto, liberarGasto, reservarGastoGeneral } from "@/lib/datos/repositorio"
import { clasificarEnPilares, costoClaude, guiaDeReclasificacion } from "@/lib/proveedores/anthropic"
import type { Database } from "@/lib/supabase/database.types"
import { estimarClasificacion, type FilaDeReclasificacion, POR_TANDA } from "./reclasificar"

/** Claude proposes; nothing is written to the knowledge base here. The spend goes through the month's limit. */
export async function proponerReclasificacion(deps: {
  db: SupabaseClient<Database>
  claude: Anthropic
  ahora: string
  avisar: (linea: string) => void
}): Promise<{ filas: FilaDeReclasificacion[]; estimado: { tandas: number; usd: number }; realUsd: number }> {
  const pilares = await pilaresActivos(deps.db)
  const elementos = await leerElementosPorReclasificar(deps.db)
  const estimado = estimarClasificacion({ elementos, sistema: guiaDeReclasificacion(pilares) })
  deps.avisar(
    `Voy a clasificar ${elementos.length} elementos en ${estimado.tandas} tandas. Costo estimado: US$ ${estimado.usd.toFixed(4)}.`,
  )
  if (elementos.length === 0) return { filas: [], estimado, realUsd: 0 }

  const clave = `reclasificar_pilares:${crypto.randomUUID()}`
  const reserva = await reservarGastoGeneral(deps.db, {
    proveedor: "anthropic",
    paso: "reclasificar_pilares",
    estimadoUsd: estimado.usd,
    clave,
    ahora: deps.ahora,
  })
  if (reserva.limite)
    throw new Error(
      "El límite del mes no alcanza para la reclasificación. Reactívalo en Ajustes o espera al próximo mes.",
    )

  let realUsd = 0
  const filas: FilaDeReclasificacion[] = []
  try {
    for (let desde = 0; desde < elementos.length; desde += POR_TANDA) {
      const tanda = elementos.slice(desde, desde + POR_TANDA)
      const { asignaciones, uso, modelo } = await clasificarEnPilares({
        cliente: deps.claude,
        pilares,
        elementos: tanda,
      })
      realUsd += costoClaude(uso, modelo)
      const porId = new Map(asignaciones.map((a) => [a.id, a]))
      for (const e of tanda) {
        const a = porId.get(e.id)
        filas.push({ id: e.id, tipo: e.tipo, antes: e.antes, propuesta: a?.pilar ?? "general", razon: a?.razon ?? "" })
      }
    }
  } catch (error) {
    // Batches that answered were billed: confirm them so the cap counts them; release only when nothing was billed.
    await cerrarGastoTrasFalla(deps, clave, realUsd)
    throw error
  }
  await confirmarGasto(deps.db, clave, Number(realUsd.toFixed(4)))
  return { filas, estimado, realUsd }
}

/** Never masks the failure that brought us here: a failure closing the spend is reported, then the caller rethrows. */
async function cerrarGastoTrasFalla(
  deps: { db: SupabaseClient<Database>; avisar: (linea: string) => void },
  clave: string,
  realUsd: number,
): Promise<void> {
  try {
    if (realUsd > 0) await confirmarGasto(deps.db, clave, Number(realUsd.toFixed(4)))
    else await liberarGasto(deps.db, clave)
  } catch (cierre) {
    deps.avisar(
      `No pude cerrar el gasto ${clave} (US$ ${realUsd.toFixed(4)}): ${cierre instanceof Error ? cierre.message : String(cierre)}. Revísalo en la tabla gastos.`,
    )
  }
}
