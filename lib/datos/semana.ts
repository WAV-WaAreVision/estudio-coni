import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import {
  pilaresParaSubir,
  type QueSubirLeido,
  type SemanaLeida,
  SIN_CORRIDA,
  type TemaDeTeoria,
  temasParaSubir,
} from "@/lib/dominio/biblioteca/semana"
import { pilaresDeRedes } from "@/lib/dominio/pilares"
import type { Database } from "@/lib/supabase/database.types"
import { leerTodas } from "./paginas"
import { leerPilares } from "./pilares"

type Db = SupabaseClient<Database>

/** The runs `estimarCostoDelMotor` looks at: the latest that cost something, newest first (4a). */
const CORRIDAS_CON_COSTO = 4

export async function leerCostosDelMotor(db: Db): Promise<number[]> {
  const { data, error } = await db
    .from("motor_corridas")
    .select("costo_usd")
    .gt("costo_usd", 0)
    .order("semana", { ascending: false })
    .limit(CORRIDAS_CON_COSTO)
  if (error) throw new Error(`No pude leer lo que costó el motor: ${error.message}`, { cause: error })
  return data.map((fila) => Number(fila.costo_usd))
}

const Resumen = z.object({
  ideas: z.number().catch(0),
  manual: z.boolean().catch(false),
  queSubir: z
    .object({ unSoloAutor: z.array(z.string()), pilaresSinMaterial: z.array(z.string()) })
    .nullable()
    .catch(null),
})

/** `jsonb` that is not the shape the engine writes is read as empty rather than breaking the whole screen (as Ingesta). */
const leerResumen = (valor: unknown) => Resumen.catch({ ideas: 0, manual: false, queSubir: null }).parse(valor)

/** id to name of the topics that still exist (a merged one too: its page leads to the one that stayed). */
async function nombresDeTemas(db: Db, ids: readonly string[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids)]
  if (unicos.length === 0) return new Map()
  const filas = await leerTodas("los temas de las teorías", (despuesDe, limite) => {
    const consulta = db.from("temas").select("id, nombre").in("id", unicos)
    return (despuesDe === null ? consulta : consulta.gt("id", despuesDe)).order("id").limit(limite)
  })
  return new Map(filas.map((tema) => [tema.id, tema.nombre]))
}

/** name to id: the engine stores single-author topics by name (`temas.nombre` is unique). */
async function idsDeTemas(db: Db, nombres: readonly string[]): Promise<Map<string, string>> {
  if (nombres.length === 0) return new Map()
  const filas = await leerTodas("los temas de un solo autor", (despuesDe, limite) => {
    const consulta = db
      .from("temas")
      .select("id, nombre")
      .in("nombre", [...nombres])
    return (despuesDe === null ? consulta : consulta.gt("id", despuesDe)).order("id").limit(limite)
  })
  return new Map(filas.map((tema) => [tema.nombre, tema.id]))
}

async function leerQueSubir(
  db: Db,
  crudo: { unSoloAutor: string[]; pilaresSinMaterial: string[] } | null,
): Promise<QueSubirLeido | null> {
  if (crudo === null) return null
  const [ids, catalogo] = await Promise.all([
    idsDeTemas(db, crudo.unSoloAutor),
    crudo.pilaresSinMaterial.length === 0 ? [] : leerPilares(db),
  ])
  return {
    unSoloAutor: temasParaSubir(crudo.unSoloAutor, ids),
    pilaresSinMaterial: pilaresParaSubir(crudo.pilaresSinMaterial, pilaresDeRedes(catalogo)),
  }
}

const puntajeDe = (teoria: { puntaje: number | null }) => teoria.puntaje ?? Number.NEGATIVE_INFINITY

/**
 * The latest run of the engine with the theories and discarded crossings of its week, and what it says to upload next
 * (ported from Ingesta's `leerSemana`). Theories by score, the unscored last. A topic that no longer exists drops out of
 * its theory's links.
 */
export async function leerSemana(db: Db): Promise<SemanaLeida> {
  const { data: corridas, error } = await db
    .from("motor_corridas")
    .select("semana, estado, costo_usd, resumen, motivo_fallo, creada_en")
    .order("semana", { ascending: false })
    .limit(1)
  if (error) throw new Error(`No pude leer la última corrida del motor: ${error.message}`, { cause: error })
  const fila = corridas[0]
  if (!fila) return SIN_CORRIDA

  const resumen = leerResumen(fila.resumen)
  const filas = await leerTodas(`las teorías de la semana ${fila.semana}`, (despuesDe, limite) => {
    const consulta = db
      .from("teorias")
      .select("id, estado, titulo, tesis, puntaje, nivel_evidencia, motivo_fallo, temas")
      .eq("origen", "motor")
      .eq("semana", fila.semana)
      .in("estado", ["guardada", "descartada_por_motor"])
    return (despuesDe === null ? consulta : consulta.gt("id", despuesDe)).order("id").limit(limite)
  })
  const ordenadas = filas.toSorted((a, b) =>
    puntajeDe(a) === puntajeDe(b) ? a.id.localeCompare(b.id) : puntajeDe(b) - puntajeDe(a),
  )
  const [nombres, queSubir] = await Promise.all([
    nombresDeTemas(
      db,
      ordenadas.flatMap((teoria) => teoria.temas),
    ),
    leerQueSubir(db, resumen.queSubir),
  ])
  const temasDe = (ids: string[]): TemaDeTeoria[] =>
    ids.flatMap((id) => {
      const nombre = nombres.get(id)
      return nombre === undefined ? [] : [{ id, nombre }]
    })

  return {
    corrida: {
      semana: fila.semana,
      estado: fila.estado,
      costoUsd: Number(fila.costo_usd),
      ideas: resumen.ideas,
      manual: resumen.manual,
      motivoFallo: fila.motivo_fallo,
      creadaEn: fila.creada_en,
    },
    teorias: ordenadas
      .filter((teoria) => teoria.estado === "guardada")
      .map((teoria) => ({
        id: teoria.id,
        titulo: teoria.titulo ?? "",
        tesis: teoria.tesis ?? "",
        puntaje: teoria.puntaje,
        nivelEvidencia: teoria.nivel_evidencia,
        temas: temasDe(teoria.temas),
      })),
    descartadas: ordenadas
      .filter((teoria) => teoria.estado === "descartada_por_motor")
      .map((teoria) => ({ id: teoria.id, razon: teoria.motivo_fallo ?? "", temas: temasDe(teoria.temas) })),
    queSubir,
  }
}
