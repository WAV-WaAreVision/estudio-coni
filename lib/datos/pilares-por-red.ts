import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import { anguloPorSlug, type CatalogoDePilares, soloActivos } from "@/lib/dominio/pilares"
import type { FilasDelLote, IdeaParaProponer, TemaParaProponer } from "@/lib/pilares/por-red"
import type { Database, Json } from "@/lib/supabase/database.types"
import { conIdYNombre } from "./biblioteca"
import { leerTodas } from "./paginas"
import { leerPilares } from "./pilares"

type Db = SupabaseClient<Database>

const IDEAS_POR_TEMA = 5
/** Keeps each `in (...)` request short; a page of 100 topics has at most a few hundred pillar rows. */
const TEMAS_POR_CONSULTA = 100

/**
 * The live topics without pillar rows (spec 2026-11-04, section 3): today's, and any the ingesta created between the
 * merge and the Trigger deploy. Each with a few of its visible ideas and the name of the category it came from.
 */
export async function leerTemasSinPilaresDeRed(db: Db): Promise<TemaParaProponer[]> {
  const temas = await leerTodas("los temas por clasificar", (despuesDe, limite) => {
    const consulta = db.from("temas_resumen").select("id, nombre, descripcion, categoria_id")
    return (despuesDe === null ? consulta : consulta.gt("id", despuesDe))
      .order("id")
      .limit(limite)
      .then(({ data, error }) => ({ data: data?.map(conIdYNombre) ?? null, error }))
  })
  const conFilas = new Set<string>()
  for (let desde = 0; desde < temas.length; desde += TEMAS_POR_CONSULTA) {
    const ids = temas.slice(desde, desde + TEMAS_POR_CONSULTA).map((tema) => tema.id)
    const { data, error } = await db.from("tema_pilares").select("tema_id").in("tema_id", ids)
    if (error) throw new Error(`No pude leer los pilares de los temas: ${error.message}`, { cause: error })
    for (const fila of data) conFilas.add(fila.tema_id)
  }
  const categorias = await db.from("categorias").select("id, nombre, nombre_corto")
  if (categorias.error) {
    throw new Error(`No pude leer las categorías: ${categorias.error.message}`, { cause: categorias.error })
  }
  const nombreDe = new Map(categorias.data.map((c) => [c.id, c.nombre_corto ?? c.nombre]))

  const resultado: TemaParaProponer[] = []
  for (const tema of temas.filter((candidato) => !conFilas.has(candidato.id))) {
    const ideas = await db
      .from("afirmaciones")
      .select("texto")
      .eq("tema_id", tema.id)
      .eq("excluida", false)
      .order("id")
      .limit(IDEAS_POR_TEMA)
    if (ideas.error) {
      throw new Error(`No pude leer las ideas del tema ${tema.id}: ${ideas.error.message}`, { cause: ideas.error })
    }
    resultado.push({
      id: tema.id,
      nombre: tema.nombre,
      descripcion: tema.descripcion,
      ideas: ideas.data.map((fila) => fila.texto),
      veniaDe: tema.categoria_id ? (nombreDe.get(tema.categoria_id) ?? "") : "",
    })
  }
  return resultado.toSorted((a, b) => a.nombre.localeCompare(b.nombre, "es"))
}

/** The bank ideas on a pillar without a network: the ones the apply step must move before it retires those pillars. */
export async function leerIdeasEnPilaresSinRed(db: Db): Promise<IdeaParaProponer[]> {
  const viejos = soloActivos(await leerPilares(db)).filter((pilar) => pilar.red === null)
  if (viejos.length === 0) return []
  const { data, error } = await db
    .from("ideas")
    .select("id, gancho, tema, pilar")
    .eq("estado", "idea")
    .in(
      "pilar",
      viejos.map((pilar) => pilar.slug),
    )
    .order("id")
  if (error) throw new Error(`No pude leer las ideas del banco: ${error.message}`, { cause: error })
  const nombreDe = new Map(viejos.map((pilar) => [pilar.slug, pilar.nombreCorto]))
  return data.map((idea) => ({
    id: idea.id,
    gancho: idea.gancho,
    tema: idea.tema,
    veniaDe: nombreDe.get(idea.pilar) ?? idea.pilar,
  }))
}

const ResumenDelLote = z.object({ filas: z.number(), ideas: z.number(), retirados: z.number() })
const ResumenDeDeshacer = z.object({ filas: z.number(), ideas: z.number(), reactivados: z.number() })

function loteAJson(filas: FilasDelLote): Json {
  return {
    temas: filas.temas.map((tema) => ({
      tema_id: tema.temaId,
      pilares: tema.pilares.map((pilar) => ({ pilar: pilar.pilar, fuerza: pilar.fuerza })),
    })),
    ideas: filas.ideas.map((idea) => ({ idea_id: idea.ideaId, pilar: idea.pilar })),
  }
}

interface RechazoDeLaBase {
  message: string
  details?: string | null
}

/**
 * What `aplicar_lote_de_pilares`, `resolver_filas_de_pilares` and `deshacer_lote_de_pilares` raise, said so Federico
 * knows what to fix in the CSV. Anything else keeps the database's own words.
 */
export function explicarRechazoDelLote(
  error: RechazoDeLaBase,
  lote: string,
  /** The spreadsheet row of a topic or idea id, so the message points at it. */
  filaDe: (id: string) => number | undefined = () => undefined,
): string {
  const detalle = error.details ?? null
  const corrige = "Corrígelo en el CSV."
  const fila = detalle === null ? undefined : filaDe(detalle)
  const elTema = fila === undefined ? `El tema ${detalle}` : `Fila ${fila} (tema ${detalle}):`
  const laIdea = fila === undefined ? `La idea ${detalle}` : `Fila ${fila} (idea ${detalle}):`
  switch (error.message) {
    case "lote_ya_aplicado":
      return `El lote ${lote} ya está aplicado. Para aplicarlo de nuevo, primero corre pnpm pilares:deshacer.`
    case "lote_inexistente":
      return `El lote ${lote} no está aplicado: no hay nada que deshacer.`
    case "lote_vacio":
      return "El CSV no trae ningún tema: no hay nada que aplicar."
    case "filas_invalidas":
      // The CSV is checked before the call (ids, pillars, layers): what still reaches here is a bug of ours.
      return `Error interno: el lote salió mal armado${detalle ? ` (${detalle})` : ""}. No es un problema del CSV: avísale a WAV.`
    case "filas_repetidas":
      return `${fila === undefined ? "El" : `Fila ${fila}: el`} id ${detalle} aparece dos veces en el CSV. Deja una sola fila.`
    case "tema_inexistente":
      return `${elTema} no existe o se fusionó con otro. Sácalo del CSV y vuelve a aplicar.`
    case "tema_ya_tiene_pilares":
      return `${elTema} ya tiene pilares (los puso Coni o la ingesta). Sácalo del CSV y vuelve a aplicar.`
    case "idea_inexistente":
      return `${laIdea} no existe. Sácala del CSV y vuelve a aplicar.`
    case "idea_fuera_del_banco":
      return `${laIdea} ya no está en el banco (se usó o se descartó). Sácala del CSV y vuelve a aplicar.`
    case "idea_en_pilar_retirado":
      return "Quedan ideas del banco en un pilar anterior que el CSV no mueve. Agrega una fila de idea para cada una, con su pilar nuevo."
    case "pilar_desconocido":
      return detalle
        ? `«${detalle}» no es un pilar activo de una red. ${corrige}`
        : `Un tema del CSV tiene un pilar que no es un pilar activo de una red. ${corrige}`
    case "pilar_repetido":
      return `Un tema del CSV repite un pilar. ${corrige}`
    case "dos_principales":
      return `Un tema del CSV tiene dos pilares principales en la misma red. ${corrige}`
    case "secundario_sin_principal":
      return `Un tema del CSV tiene un secundario en una red donde no tiene pilar. ${corrige}`
    case "fuerza_invalida":
      return `Un tema del CSV tiene un pilar con una fuerza que no corresponde. ${corrige}`
    default:
      return `La base rechazó el lote: ${error.message}${detalle ? ` (${detalle})` : ""}.`
  }
}

/** Runs `aplicar_lote_de_pilares`: one transaction, refused whole on any bad row. Service role only. */
export async function aplicarLoteDePilares(
  db: Db,
  lote: string,
  filas: FilasDelLote,
  filaDe?: (id: string) => number | undefined,
): Promise<z.infer<typeof ResumenDelLote>> {
  const { data, error } = await db.rpc("aplicar_lote_de_pilares", { p_lote: lote, p_filas: loteAJson(filas) })
  if (error) throw new Error(explicarRechazoDelLote(error, lote, filaDe), { cause: error })
  return ResumenDelLote.parse(data)
}

export async function deshacerLoteDePilares(db: Db, lote: string): Promise<z.infer<typeof ResumenDeDeshacer>> {
  const { data, error } = await db.rpc("deshacer_lote_de_pilares", { p_lote: lote })
  if (error) throw new Error(explicarRechazoDelLote(error, lote), { cause: error })
  return ResumenDeDeshacer.parse(data)
}

/**
 * After `aplicar_lote_de_pilares` (spec 15d, plan decision 1): each moved idea's angle, when the CSV names one. The
 * 15a function stays untouched; if this step fails, the lot stays applied and the ideas without those angles. Answers
 * how many angles it set.
 */
export async function ponerAngulosDelLote(
  db: Db,
  ideas: FilasDelLote["ideas"],
  catalogo: CatalogoDePilares,
): Promise<number> {
  let puestos = 0
  for (const idea of ideas) {
    const angulo = anguloPorSlug(catalogo, idea.pilar, idea.angulo)
    if (!angulo) continue
    const { error } = await db.from("ideas").update({ angulo_id: angulo.id }).eq("id", idea.ideaId)
    if (error) {
      throw new Error(
        `Apliqué el lote, pero no pude poner el ángulo de la idea ${idea.ideaId}: ${error.message}. Ponlo desde su tarjeta en Ideas.`,
        { cause: error },
      )
    }
    puestos += 1
  }
  return puestos
}
