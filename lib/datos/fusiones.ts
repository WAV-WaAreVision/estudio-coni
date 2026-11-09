import type { SupabaseClient } from "@supabase/supabase-js"
import type { FusionesLeidas, ParRechazado } from "@/lib/dominio/fusiones"
import type { Database } from "@/lib/supabase/database.types"

type Db = SupabaseClient<Database>

const DIAS_DE_RECIENTES = 30
const UN_DIA_MS = 86_400_000

const fallo = (que: string, error: { message: string }) => new Error(`${que}: ${error.message}`, { cause: error })

/** Spec 2026-11-09: what Coni decides, what was merged in the last 30 days, and the pairs not merged. */
export async function leerFusiones(db: Db, ahora: number): Promise<FusionesLeidas> {
  const desde = new Date(ahora - DIAS_DE_RECIENTES * UN_DIA_MS).toISOString()
  const temas = "ganador:temas!fusiones_ganador_id_fkey ( nombre ), perdedor:temas!fusiones_perdedor_id_fkey ( nombre )"
  const [propuestas, recientes, rechazadas] = await Promise.all([
    db.from("fusiones").select(`id, razon, motivo_delicada, ${temas}`).eq("estado", "propuesta").order("creada_en"),
    db
      .from("fusiones")
      .select(`id, razon, aplicada_en, ${temas}`)
      .eq("estado", "aplicada")
      .gte("aplicada_en", desde)
      .order("aplicada_en", { ascending: false }),
    db
      .from("temas_fusion_rechazada")
      .select(
        "tema_a, tema_b, origen, razon, a:temas!temas_fusion_rechazada_tema_a_fkey ( nombre, fusionado_en ), b:temas!temas_fusion_rechazada_tema_b_fkey ( nombre, fusionado_en )",
      )
      // Coni's decisions stay; Claude's only until the pair may be asked again.
      .or(`origen.eq.coni,rechazada_en.gte.${desde}`)
      .order("rechazada_en", { ascending: false }),
  ])
  if (propuestas.error) throw fallo("No pude leer las fusiones por decidir", propuestas.error)
  if (recientes.error) throw fallo("No pude leer las fusiones recientes", recientes.error)
  if (rechazadas.error) throw fallo("No pude leer los pares que no se unieron", rechazadas.error)
  return {
    propuestas: propuestas.data.map((f) => ({
      id: f.id,
      ganador: f.ganador?.nombre ?? "",
      perdedor: f.perdedor?.nombre ?? "",
      razon: f.razon,
      motivo: f.motivo_delicada,
    })),
    recientes: recientes.data.flatMap((f) =>
      f.aplicada_en
        ? [
            {
              id: f.id,
              ganador: f.ganador?.nombre ?? "",
              perdedor: f.perdedor?.nombre ?? "",
              razon: f.razon,
              aplicadaEn: f.aplicada_en,
            },
          ]
        : [],
    ),
    // A pair whose topic was merged away since cannot be joined: it leaves the list.
    rechazadas: rechazadas.data.flatMap((p): ParRechazado[] =>
      p.a && p.b && p.a.fusionado_en === null && p.b.fusionado_en === null
        ? [
            {
              a: p.tema_a,
              b: p.tema_b,
              nombreA: p.a.nombre,
              nombreB: p.b.nombre,
              origen: p.origen === "coni" ? "coni" : "claude",
              razon: p.razon,
            },
          ]
        : [],
    ),
  }
}

export async function contarPropuestasDeFusion(db: Db): Promise<number> {
  const { count, error } = await db
    .from("fusiones")
    .select("id", { count: "exact", head: true })
    .eq("estado", "propuesta")
  if (error) throw fallo("No pude contar las fusiones por decidir", error)
  return count ?? 0
}

/** Inicio opens even when this read fails (as the LinkedIn reminder): the failure is logged and counts 0. */
export async function contarPropuestasParaInicio(db: Db): Promise<number> {
  try {
    return await contarPropuestasDeFusion(db)
  } catch (error) {
    console.error("No pude contar las fusiones por decidir para Inicio", error)
    return 0
  }
}

export interface OrigenDeTema {
  alias: string[]
  subtemaDe: { id: string; nombre: string } | null
}

/** The topic page's lines: its other names and the live topic it is part of. */
export async function leerOrigenDeTema(db: Db, id: string): Promise<OrigenDeTema> {
  const [tema, padres] = await Promise.all([
    db.from("temas").select("alias").eq("id", id).maybeSingle(),
    db
      .from("temas_subtemas")
      .select("padre:temas!temas_subtemas_padre_id_fkey ( id, nombre, fusionado_en )")
      .eq("tema_id", id),
  ])
  if (tema.error) throw fallo(`No pude leer los nombres del tema ${id}`, tema.error)
  if (padres.error) throw fallo(`No pude leer de qué tema es parte ${id}`, padres.error)
  const vivo = padres.data
    .flatMap((fila) => (fila.padre && fila.padre.fusionado_en === null ? [fila.padre] : []))
    .sort((x, y) => x.nombre.localeCompare(y.nombre, "es"))[0]
  return { alias: tema.data?.alias ?? [], subtemaDe: vivo ? { id: vivo.id, nombre: vivo.nombre } : null }
}
