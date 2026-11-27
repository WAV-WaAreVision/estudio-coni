import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import {
  ACCIONES,
  type AfirmacionLeida,
  CAMPOS,
  type EmocionDeIdea,
  type Insignias,
  insigniasPorIdea,
} from "@/lib/dominio/biblioteca/etiquetas-de-afirmacion"
import { Ubicacion } from "@/lib/dominio/biblioteca/ficha"
import type { IdeaLeida } from "@/lib/dominio/biblioteca/ideas"
import { CERTEZAS, MARCAS } from "@/lib/dominio/vocabulario"
import type { Database } from "@/lib/supabase/database.types"
import { leerTodas } from "./paginas"
import { leerCatalogoDeEtiquetas } from "./vocabulario"

type Db = SupabaseClient<Database>

const RED = z.enum(["linkedin", "instagram", "todas"])
const ORIGEN = z.enum(["extraccion", "traduccion", "coni"])

const COLUMNAS =
  "id, texto, cita, tipo, evidencia, ubicacion, etiquetas_antiguas, publico, dolor, emocion, gancho, material_id, autor_id, tema_id, materiales!inner ( titulo, borrar_desde ), autores ( nombre, borrar_desde ), temas ( nombre ), afirmacion_marcas ( id, marca, red, valor, frase, certeza, por_que, origen, creada_en ), ganchos ( frase_exacta, frase_sin_gancho, tipo, certeza, origen ), correcciones_de_etiqueta ( campo, red, accion, marca_id, creada_en )"

const FilaDeGancho = z.object({
  frase_exacta: z.string(),
  frase_sin_gancho: z.string(),
  tipo: z.string(),
  certeza: z.enum(CERTEZAS),
  origen: ORIGEN,
})

// Checked once here: the generated types say text where the tables' checks say a closed set.
const FilaDeAfirmacion = z.object({
  id: z.string(),
  texto: z.string(),
  cita: z.string(),
  tipo: z.string(),
  evidencia: z.string(),
  ubicacion: z.unknown(),
  etiquetas_antiguas: z.boolean(),
  publico: z.string().nullable(),
  dolor: z.string().nullable(),
  emocion: z.string().nullable(),
  gancho: z.string().nullable(),
  material_id: z.string(),
  autor_id: z.string(),
  tema_id: z.string().nullable(),
  materiales: z.object({ titulo: z.string().nullable() }),
  autores: z.object({ nombre: z.string(), borrar_desde: z.string().nullable() }).nullable(),
  temas: z.object({ nombre: z.string() }).nullable(),
  afirmacion_marcas: z.array(
    z.object({
      id: z.string(),
      marca: z.enum(MARCAS),
      red: RED,
      valor: z.string(),
      frase: z.string().nullable(),
      certeza: z.enum(CERTEZAS),
      por_que: z.string().nullable(),
      origen: ORIGEN,
      creada_en: z.string(),
    }),
  ),
  // `ganchos.afirmacion_id` is unique, so PostgREST embeds one object; an array is accepted in case it does not.
  ganchos: z.union([FilaDeGancho, z.array(FilaDeGancho)]).nullable(),
  correcciones_de_etiqueta: z.array(
    z.object({
      campo: z.enum(CAMPOS),
      red: RED,
      accion: z.enum(ACCIONES),
      marca_id: z.string().nullable(),
      creada_en: z.string(),
    }),
  ),
})

/** One claim with every tag; null when it is hidden, its material was deleted with «Deshacer», or it does not exist. */
export async function leerAfirmacion(db: Db, id: string): Promise<AfirmacionLeida | null> {
  const { data, error } = await db
    .from("afirmaciones")
    .select(COLUMNAS)
    .eq("id", id)
    .eq("excluida", false)
    .is("materiales.borrar_desde", null)
    .maybeSingle()
  if (error) throw new Error(`No pude leer la idea ${id}: ${error.message}`, { cause: error })
  if (!data) return null
  const fila = FilaDeAfirmacion.parse(data)
  const ubicacion = Ubicacion.safeParse(fila.ubicacion)
  const gancho = Array.isArray(fila.ganchos) ? (fila.ganchos[0] ?? null) : fila.ganchos
  return {
    id: fila.id,
    texto: fila.texto,
    cita: fila.cita,
    tipo: fila.tipo,
    evidencia: fila.evidencia,
    ubicacion: ubicacion.success ? ubicacion.data : null,
    material: { id: fila.material_id, titulo: fila.materiales.titulo },
    // An author marked for deletion shows no name and no link, like `autores_visibles`.
    autor:
      fila.autores && fila.autores.borrar_desde === null ? { id: fila.autor_id, nombre: fila.autores.nombre } : null,
    tema: fila.tema_id && fila.temas ? { id: fila.tema_id, nombre: fila.temas.nombre } : null,
    etiquetasAntiguas: fila.etiquetas_antiguas,
    textoAntiguo: { publico: fila.publico, dolor: fila.dolor, emocion: fila.emocion, gancho: fila.gancho },
    marcas: fila.afirmacion_marcas
      .toSorted((a, b) => a.creada_en.localeCompare(b.creada_en) || a.id.localeCompare(b.id))
      .map((marca) => ({
        id: marca.id,
        marca: marca.marca,
        red: marca.red,
        valor: marca.valor,
        frase: marca.frase,
        certeza: marca.certeza,
        porQue: marca.por_que,
        origen: marca.origen,
      })),
    gancho: gancho
      ? {
          fraseExacta: gancho.frase_exacta,
          fraseSinGancho: gancho.frase_sin_gancho,
          tipo: gancho.tipo,
          certeza: gancho.certeza,
          origen: gancho.origen,
        }
      : null,
    correcciones: fila.correcciones_de_etiqueta.map((correccion) => ({
      campo: correccion.campo,
      red: correccion.red,
      accion: correccion.accion,
      marcaId: correccion.marca_id,
      creadaEn: correccion.creada_en,
    })),
  }
}

/** A material's visible ideas, oldest first (its «Cada idea» list). */
export async function leerIdeasDelMaterial(db: Db, materialId: string): Promise<IdeaLeida[]> {
  const filas = await leerTodas(`las ideas del material ${materialId}`, (despuesDe, limite) => {
    const consulta = db
      .from("afirmaciones")
      .select("id, texto, tipo, evidencia, creada_en, materiales!inner ( borrar_desde )")
      .eq("material_id", materialId)
      .eq("excluida", false)
      .is("materiales.borrar_desde", null)
    return (despuesDe === null ? consulta : consulta.gt("id", despuesDe)).order("id").limit(limite)
  })
  return filas
    .toSorted((a, b) => a.creada_en.localeCompare(b.creada_en) || a.id.localeCompare(b.id))
    .map(({ id, texto, tipo, evidencia }) => ({ id, texto, tipo, evidencia }))
}

const FilaDeEmocion = z.object({
  afirmacion_id: z.string(),
  red: RED,
  valor: z.string(),
  certeza: z.enum(CERTEZAS),
  origen: ORIGEN,
  creada_en: z.string(),
})

// A hundred ideas per request keeps the `in (...)` address short; each has at most a few emotions.
const IDEAS_POR_PEDIDO = 100

async function leerEmociones(db: Db, ids: readonly string[]): Promise<EmocionDeIdea[]> {
  const lotes: string[][] = []
  for (let desde = 0; desde < ids.length; desde += IDEAS_POR_PEDIDO)
    lotes.push(ids.slice(desde, desde + IDEAS_POR_PEDIDO))
  const respuestas = await Promise.all(
    lotes.map((lote) =>
      db
        .from("afirmacion_marcas")
        .select("afirmacion_id, red, valor, certeza, origen, creada_en")
        .eq("marca", "emocion")
        .in("afirmacion_id", lote)
        .order("creada_en")
        .order("id"),
    ),
  )
  return respuestas.flatMap(({ data, error }) => {
    if (error) throw new Error(`No pude leer las emociones de las ideas: ${error.message}`, { cause: error })
    return z
      .array(FilaDeEmocion)
      .parse(data)
      .map((fila) => ({
        afirmacionId: fila.afirmacion_id,
        red: fila.red,
        valor: fila.valor,
        certeza: fila.certeza,
        origen: fila.origen,
        creadaEn: fila.creada_en,
      }))
  })
}

/** The badges of the ideas a list shows (spec 6c-1), by idea id. */
export async function leerInsigniasDeIdeas(db: Db, ideas: readonly IdeaLeida[]): Promise<Map<string, Insignias>> {
  if (ideas.length === 0) return new Map()
  const [catalogo, emociones] = await Promise.all([
    leerCatalogoDeEtiquetas(db),
    leerEmociones(
      db,
      ideas.map((idea) => idea.id),
    ),
  ])
  return insigniasPorIdea(ideas, emociones, catalogo)
}
