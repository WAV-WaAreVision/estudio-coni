import { falloDeBase, MaterialBorrado } from "@/lib/ingesta/gasto-material"
import { type DepsProcesar, incrustarFicha, VIGENCIA_DE_CORRIDA_SEGUNDOS } from "@/lib/ingesta/procesar"
import { intentarVincular, MAXIMO_INTENTOS_VINCULOS } from "@/lib/ingesta/vincular"
import type { Database } from "@/lib/supabase/database.types"

type Material = Database["public"]["Tables"]["materiales"]["Row"]

export interface ResultadoCompletarVinculos {
  /** Materials this sweep took, whether or not their embedding and links got done. */
  procesados: number
  /** The monthly cap stopped the sweep: the rest waits for the next run. */
  tope: boolean
}

/**
 * Ready materials with a card that still lack their vector or whose links are flagged pending, oldest first. Those that
 * used up their attempts are left out: only a person can say a material is worth trying again.
 */
async function pendientesDeCompletar(deps: DepsProcesar, limite: number): Promise<string[]> {
  const { db } = deps
  const sinVector = await db
    .from("materiales")
    .select("id, creado_en, fichas!inner(material_id), embeddings_ficha(material_id)")
    .eq("estado", "listo")
    .lt("vinculos_intentos", MAXIMO_INTENTOS_VINCULOS)
    .is("embeddings_ficha", null)
    .order("creado_en")
    .limit(limite)
  if (sinVector.error) throw falloDeBase("No pude buscar materiales sin embedding", sinVector.error)
  const marcados = await db
    .from("materiales")
    .select("id, creado_en, fichas!inner(material_id)")
    .eq("estado", "listo")
    .lt("vinculos_intentos", MAXIMO_INTENTOS_VINCULOS)
    .eq("vinculos_pendientes", true)
    .order("creado_en")
    .limit(limite)
  if (marcados.error) throw falloDeBase("No pude buscar materiales con vínculos pendientes", marcados.error)
  const porId = new Map([...sinVector.data, ...marcados.data].map((m) => [m.id, m.creado_en]))
  return [...porId.entries()]
    .sort(([, a], [, b]) => a.localeCompare(b))
    .slice(0, limite)
    .map(([id]) => id)
}

/**
 * A ready material has no run, so the sweep takes it with the same claim a run uses (`corrida_id`): a second sweep,
 * or the same one slow, skips what is held, and a claim older than a task can last is a dead holder's.
 */
async function reclamar(deps: DepsProcesar, id: string): Promise<Material | null> {
  const ahora = deps.ahora()
  const vencida = new Date(new Date(ahora).getTime() - VIGENCIA_DE_CORRIDA_SEGUNDOS * 1000).toISOString()
  const { data, error } = await deps.db
    .from("materiales")
    .update({ corrida_id: deps.corrida, corrida_desde: ahora })
    .eq("id", id)
    .eq("estado", "listo")
    .or(`corrida_id.is.null,corrida_desde.lt.${vencida}`)
    .select("*")
    .maybeSingle()
  if (error) throw falloDeBase("No pude tomar el material", error)
  return data
}

async function liberar(deps: DepsProcesar, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return
  const { error } = await deps.db
    .from("materiales")
    .update({ corrida_id: null, corrida_desde: null })
    .in("id", [...ids])
    .eq("corrida_id", deps.corrida)
  if (error) throw falloDeBase("No pude soltar los materiales", error)
}

function avisarFalla(materialId: string, falla: unknown): void {
  console.warn(`No pude completar el material ${materialId}: ${falla instanceof Error ? falla.message : "error"}`)
}

/**
 * Backfill for ready materials the later steps never reached: those processed before the embeddings existed and those
 * left with `vinculos_pendientes`. Embeds all the batch first, so its materials can find each other, then links them.
 * One material failing never stops the others; the cap stops the sweep. What is paid is read back from the store, so a
 * repeated sweep does not pay twice.
 */
export async function completarVinculos(
  deps: DepsProcesar,
  { limite }: { limite: number },
): Promise<ResultadoCompletarVinculos> {
  if (!deps.llaveVoyage?.()) return { procesados: 0, tope: false }
  const tomados: Material[] = []
  for (const id of await pendientesDeCompletar(deps, limite)) {
    const material = await reclamar(deps, id)
    if (material) tomados.push(material)
  }
  let tope = false
  try {
    for (const material of tomados) {
      try {
        if ((await incrustarFicha({ deps, material })) === "tope") {
          tope = true
          break
        }
      } catch (falla) {
        if (!(falla instanceof MaterialBorrado)) avisarFalla(material.id, falla)
      }
    }
    for (const material of tope ? [] : tomados) {
      try {
        if ((await intentarVincular(deps, material.id)) === "tope") {
          tope = true
          break
        }
      } catch (falla) {
        if (!(falla instanceof MaterialBorrado)) avisarFalla(material.id, falla)
      }
    }
  } finally {
    await liberar(
      deps,
      tomados.map((m) => m.id),
    )
  }
  return { procesados: tomados.length, tope }
}
