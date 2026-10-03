import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import {
  type Contexto,
  falloDeBase,
  MaterialBorrado,
  pagadoAntes,
  pagar,
  redondear,
} from "@/lib/ingesta/gasto-material"
import type { DepsProcesar } from "@/lib/ingesta/procesar"
import {
  clasificarVinculos,
  costoClaude,
  type FichaParaVincular,
  MODELO_POR_TAREA,
  TIPOS_DE_VINCULO,
  type VinculoPropuesto,
} from "@/lib/proveedores/anthropic"
import type { Database } from "@/lib/supabase/database.types"

type Db = SupabaseClient<Database>

/** How many neighbours Claude weighs for a card. */
export const CANDIDATOS_POR_MATERIAL = 10

// Over-estimates, like every reservation: the real cost replaces them on confirming.
const TOKENS_FIJOS_VINCULOS = 1_500
const TOKENS_DE_SALIDA_POR_CANDIDATO = 250
const CARACTERES_POR_TOKEN = 3

const Propuestos = z.array(
  z.object({
    candidatoId: z.string(),
    tipo: z.enum(TIPOS_DE_VINCULO),
    relevancia: z.number(),
    razon: z.string(),
    citaBase: z.string(),
    citaCandidata: z.string(),
  }),
)

function estimarVinculos(base: FichaParaVincular, candidatos: readonly FichaParaVincular[]): number {
  const caracteres = [base, ...candidatos].reduce(
    (total, f) => total + [f.resumen, ...f.ideas, ...f.citas].join("").length + f.titulo.length,
    0,
  )
  return redondear(
    costoClaude(
      {
        input_tokens: Math.ceil(caracteres / CARACTERES_POR_TOKEN) + TOKENS_FIJOS_VINCULOS,
        output_tokens: TOKENS_DE_SALIDA_POR_CANDIDATO * candidatos.length,
      },
      MODELO_POR_TAREA.clasificarVinculos.modelo,
    ),
  )
}

async function leerFichas(db: Db, ids: readonly string[]): Promise<Map<string, FichaParaVincular>> {
  const { data, error } = await db
    .from("fichas")
    .select("material_id, resumen, ideas_clave, citas, materiales(titulo)")
    .in("material_id", [...ids])
  if (error) throw falloDeBase("No pude leer las fichas", error)
  const ideas = z.array(z.string())
  const citas = z.array(z.object({ texto: z.string() }))
  return new Map(
    data.map((f) => [
      f.material_id,
      {
        id: f.material_id,
        titulo: f.materiales?.titulo?.trim() || "Sin título",
        resumen: f.resumen,
        ideas: ideas.parse(f.ideas_clave),
        citas: citas.parse(f.citas).map((c) => c.texto),
      },
    ]),
  )
}

async function tieneEmbedding(db: Db, id: string): Promise<boolean> {
  const { data, error } = await db.from("embeddings_ficha").select("material_id").eq("material_id", id).maybeSingle()
  if (error) throw falloDeBase("No pude leer el embedding", error)
  return data !== null
}

async function candidatosDe(db: Db, id: string): Promise<string[]> {
  const { data, error } = await db.rpc("materiales_cercanos", { p_material: id, p_limite: CANDIDATOS_POR_MATERIAL })
  if (error) throw falloDeBase("No pude buscar materiales cercanos", error)
  return data.map((fila) => fila.material_id)
}

/** The pair is stored with the smaller id first, and each quote goes with the material it was taken from. */
function filaDeVinculo(materialId: string, v: VinculoPropuesto) {
  const propioPrimero = materialId < v.candidatoId
  return {
    material_a: propioPrimero ? materialId : v.candidatoId,
    material_b: propioPrimero ? v.candidatoId : materialId,
    tipo: v.tipo,
    relevancia: v.relevancia,
    razon: v.razon,
    cita_a: propioPrimero ? v.citaBase : v.citaCandidata,
    cita_b: propioPrimero ? v.citaCandidata : v.citaBase,
  }
}

async function marcarPendiente(db: Db, id: string, pendiente: boolean): Promise<void> {
  const { error } = await db.from("materiales").update({ vinculos_pendientes: pendiente }).eq("id", id)
  if (error) throw falloDeBase("No pude actualizar el material", error)
}

async function vincular(ctx: Contexto): Promise<boolean> {
  const { deps, material } = ctx
  const { db } = deps
  if (!(await tieneEmbedding(db, material.id))) return false
  const candidatos = await candidatosDe(db, material.id)
  if (candidatos.length === 0) return true
  const fichas = await leerFichas(db, [material.id, ...candidatos])
  const base = fichas.get(material.id)
  const deLasCandidatas = candidatos.flatMap((id) => fichas.get(id) ?? [])
  if (!base || deLasCandidatas.length === 0) return true

  const archivo = `materiales/${material.id}/vinculos.json`
  let propuestos = await pagadoAntes(ctx, archivo, Propuestos)
  if (!propuestos) {
    const pagado = await pagar(ctx, {
      archivo,
      proveedor: "anthropic",
      paso: "vinculos",
      estimadoUsd: estimarVinculos(base, deLasCandidatas),
      llamar: async () => {
        const r = await clasificarVinculos({ cliente: deps.claude, base, candidatos: deLasCandidatas })
        return { datos: r.vinculos, realUsd: costoClaude(r.uso, MODELO_POR_TAREA.clasificarVinculos.modelo) }
      },
    })
    // The cap is not a reason to fail the material: the links wait for the later pass.
    if (pagado.tope) return false
    propuestos = pagado.datos
  }
  if (propuestos.length > 0) {
    // A pair that got a row meanwhile (a person decided it) keeps it: suggestions never overwrite.
    const { error } = await db.from("vinculos").upsert(
      propuestos.map((v) => filaDeVinculo(material.id, v)),
      { onConflict: "material_a,material_b", ignoreDuplicates: true },
    )
    if (error) throw falloDeBase("No pude guardar los vínculos", error)
  }
  return true
}

/**
 * Suggests links between this card and its nearest neighbours, in one Claude call. Never fails the material: with no
 * embedding, the cap reached or a provider error it is flagged `vinculos_pendientes` for the later pass. Returns
 * whether the links are done (also when there was nobody to link with).
 */
export async function vincularMaterial(deps: DepsProcesar, materialId: string): Promise<boolean> {
  const { data: material, error } = await deps.db.from("materiales").select("*").eq("id", materialId).maybeSingle()
  if (error) throw falloDeBase("No pude leer el material", error)
  if (!material) throw new MaterialBorrado()
  let hecho: boolean
  try {
    hecho = await vincular({ deps, material })
  } catch (falla) {
    if (falla instanceof MaterialBorrado) throw falla
    // Visible in the logs; the provider clients already redact their keys.
    console.warn(`Vínculos pendientes del material ${materialId}: ${falla instanceof Error ? falla.message : "error"}`)
    hecho = false
  }
  await marcarPendiente(deps.db, materialId, !hecho)
  return hecho
}
