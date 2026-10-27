import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import type { FilaDePieza } from "@/lib/datos/repositorio"
import { type Lamina, MINIMO_DE_IDEAS_DEL_CARRUSEL } from "@/lib/dominio/carrusel"
import type { Database, Json } from "@/lib/supabase/database.types"

type Db = SupabaseClient<Database>

function fallo(contexto: string, error: { message: string }): Error {
  return new Error(`${contexto}: ${error.message}`, { cause: error })
}

const esquemaDeLamina = z.object({
  tipo: z.enum(["portada", "idea", "cierre"]),
  texto: z.string().min(1),
  destacado: z.string().min(1).optional(),
  fuente: z.string().min(1).optional(),
})

/**
 * `carruseles.laminas`: a portada, the ideas and a closing slide, in that order. Only the writer and the gate
 * functions write it, so a shape that does not parse is a bug to fix, not something to show Coni.
 */
export function leerLaminas(valor: Json): Lamina[] {
  const resultado = z.array(esquemaDeLamina).safeParse(valor)
  if (!resultado.success) {
    throw new Error(`Las láminas guardadas no tienen el formato esperado: ${resultado.error.message}`)
  }
  const laminas = resultado.data
  const ideas = laminas.slice(1, -1)
  if (
    laminas[0]?.tipo !== "portada" ||
    laminas.at(-1)?.tipo !== "cierre" ||
    ideas.length < MINIMO_DE_IDEAS_DEL_CARRUSEL ||
    ideas.some((lamina) => lamina.tipo !== "idea")
  ) {
    throw new Error("Las láminas guardadas no siguen el orden portada, ideas, cierre.")
  }
  return laminas
}

/** Slides as the plain JSON `carruseles.laminas` stores (no undefined keys). */
export function laminasAJson(laminas: readonly Lamina[]): Json {
  return laminas.map((lamina) => ({
    tipo: lamina.tipo,
    texto: lamina.texto,
    ...(lamina.destacado === undefined ? {} : { destacado: lamina.destacado }),
    ...(lamina.fuente === undefined ? {} : { fuente: lamina.fuente }),
  }))
}

export interface CarruselVigente {
  id: string
  version: number
  laminas: Lamina[]
  textoPost: string
  hashTexto: string
  origen: string
  pedido: string | null
}

/** The latest version of a carousel's text: what gate 1 shows and signs. Null while the first one is being written. */
export async function leerCarruselVigente(db: Db, piezaId: string): Promise<CarruselVigente | null> {
  const { data, error } = await db
    .from("carruseles")
    .select("id, version, laminas, texto_post, hash_texto, origen, pedido")
    .eq("pieza_id", piezaId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw fallo("No pude leer el carrusel", error)
  if (!data) return null
  return {
    id: data.id,
    version: data.version,
    laminas: leerLaminas(data.laminas),
    textoPost: data.texto_post,
    hashTexto: data.hash_texto,
    origen: data.origen,
    pedido: data.pedido,
  }
}

/**
 * How many times she asked for a new text (C8): counted on the piece when she asks (`pedir_cambio_de_carrusel`), so a
 * request still pending, or one Claude declined, counts as the database counts it for the limit.
 */
export async function contarCambiosDeTexto(db: Db, piezaId: string): Promise<number> {
  const { data, error } = await db.from("piezas").select("cambios_de_texto").eq("id", piezaId).single()
  if (error) throw fallo("No pude contar los cambios del carrusel", error)
  return data.cambios_de_texto
}

/** The errors of `guardar_carrusel` are its contract (supabase/migrations/20261026000120_carrusel_funciones.sql). */
const ERROR_VERSION_DESFASADA = "version_desfasada"

/**
 * Saves a new version of the text and confirms the Claude spend that paid for it in one transaction
 * (`guardar_carrusel`). Null means the piece changed meanwhile, the same contract as `guardarBorrador`.
 */
export async function guardarCarrusel(
  db: Db,
  entrada: {
    piezaId: string
    versionLeida: number
    laminas: Json
    textoPost: string
    hashTexto: string
    revision: Json
    clave: string
    realUsd: number
    respaldo: Json | null
  },
): Promise<FilaDePieza | null> {
  const { data, error } = await db.rpc("guardar_carrusel", {
    p_pieza: entrada.piezaId,
    p_version: entrada.versionLeida,
    p_laminas: entrada.laminas,
    p_texto_post: entrada.textoPost,
    p_hash_texto: entrada.hashTexto,
    p_revision: entrada.revision,
    p_clave: entrada.clave,
    p_real: entrada.realUsd,
    p_respaldo: entrada.respaldo ?? undefined,
  })
  if (error) {
    if (error.message === ERROR_VERSION_DESFASADA) return null
    throw fallo("No pude guardar el carrusel", error)
  }
  return data
}
