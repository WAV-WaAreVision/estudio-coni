import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import type { FilaDePieza } from "@/lib/datos/repositorio"
import { type Lamina, MINIMO_DE_IDEAS_DEL_CARRUSEL } from "@/lib/dominio/carrusel"
import { type DisenoDeCarrusel, leerDiseno } from "@/lib/dominio/diseno-carrusel"
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

export const ESTADOS_DE_VERSION = ["escrito", "armando", "listo", "fallo"] as const
export type EstadoDeVersion = (typeof ESTADOS_DE_VERSION)[number]

/** A version with what its render needs and produced (part 2). */
export interface VersionDeCarrusel extends CarruselVigente {
  diseno: DisenoDeCarrusel
  estado: EstadoDeVersion
  pdfClave: string | null
  pngClaves: string[]
}

const COLUMNAS_DE_VERSION =
  "id, version, laminas, texto_post, hash_texto, origen, pedido, diseno, estado, pdf_clave, png_claves"

interface FilaDeVersion {
  id: string
  version: number
  laminas: Json
  texto_post: string
  hash_texto: string
  origen: string
  pedido: string | null
  diseno: Json
  estado: string
  pdf_clave: string | null
  png_claves: string[]
}

function versionDesdeFila(fila: FilaDeVersion): VersionDeCarrusel {
  const estado = z.enum(ESTADOS_DE_VERSION).safeParse(fila.estado)
  if (!estado.success) throw new Error(`Estado de versión desconocido: ${fila.estado}`)
  return {
    id: fila.id,
    version: fila.version,
    laminas: leerLaminas(fila.laminas),
    textoPost: fila.texto_post,
    hashTexto: fila.hash_texto,
    origen: fila.origen,
    pedido: fila.pedido,
    diseno: leerDiseno(fila.diseno),
    estado: estado.data,
    pdfClave: fila.pdf_clave,
    pngClaves: fila.png_claves,
  }
}

/** The latest version of a carousel with its render: what the task renders and gate 2 shows. */
export async function leerVersionVigente(db: Db, piezaId: string): Promise<VersionDeCarrusel | null> {
  const { data, error } = await db
    .from("carruseles")
    .select(COLUMNAS_DE_VERSION)
    .eq("pieza_id", piezaId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw fallo("No pude leer la versión del carrusel", error)
  return data ? versionDesdeFila(data) : null
}

/** One version by id: the one gate 2 signed (`puerta2_carrusel_id`). */
export async function leerVersion(db: Db, carruselId: string): Promise<VersionDeCarrusel | null> {
  const { data, error } = await db.from("carruseles").select(COLUMNAS_DE_VERSION).eq("id", carruselId).maybeSingle()
  if (error) throw fallo("No pude leer la versión del carrusel", error)
  return data ? versionDesdeFila(data) : null
}

/** The render state of a version (the service's only write to a version outside the database functions). */
export async function marcarVersion(db: Db, carruselId: string, estado: "armando" | "fallo"): Promise<void> {
  const { error } = await db.from("carruseles").update({ estado }).eq("id", carruselId).neq("estado", "listo")
  if (error) throw fallo("No pude marcar la versión del carrusel", error)
}

/**
 * The run starts rendering a version now (`en`): the maintenance gives the render an hour from here
 * (lib/mantenimiento/conciliar.ts), not from when it was asked for.
 */
export async function empezarArmado(db: Db, carruselId: string, en: string): Promise<void> {
  const { error } = await db
    .from("carruseles")
    .update({ estado: "armando", armado_empezo_en: en })
    .eq("id", carruselId)
    .neq("estado", "listo")
  if (error) throw fallo("No pude marcar la versión del carrusel", error)
}

/** After the last retry of a render: the latest version, if it was being rendered, failed. */
export async function marcarArmadoFallido(db: Db, piezaId: string): Promise<void> {
  const version = await leerVersionVigente(db, piezaId)
  if (version && (version.estado === "escrito" || version.estado === "armando")) {
    await marcarVersion(db, version.id, "fallo")
  }
}

/** `guardar_armado` (20261027000110). Null means the piece changed meanwhile. */
export async function guardarArmado(
  db: Db,
  entrada: { carruselId: string; versionLeida: number; pdf: string; pngs: string[] },
): Promise<FilaDePieza | null> {
  const { data, error } = await db.rpc("guardar_armado", {
    p_carrusel: entrada.carruselId,
    p_version: entrada.versionLeida,
    p_pdf: entrada.pdf,
    p_pngs: entrada.pngs,
  })
  if (error) {
    if (error.message === ERROR_VERSION_DESFASADA) return null
    throw fallo("No pude guardar el carrusel armado", error)
  }
  return data
}

/** `guardar_acortado` (20261027000110). Null means the piece changed meanwhile. */
export async function guardarAcortado(
  db: Db,
  entrada: {
    carruselId: string
    versionLeida: number
    laminas: Json
    hashTexto: string
    revision: Json
    explicacion: string
    clave: string
    realUsd: number
  },
): Promise<FilaDePieza | null> {
  const { data, error } = await db.rpc("guardar_acortado", {
    p_carrusel: entrada.carruselId,
    p_version: entrada.versionLeida,
    p_laminas: entrada.laminas,
    p_hash_texto: entrada.hashTexto,
    p_revision: entrada.revision,
    p_explicacion: entrada.explicacion,
    p_clave: entrada.clave,
    p_real: entrada.realUsd,
  })
  if (error) {
    if (error.message === ERROR_VERSION_DESFASADA) return null
    throw fallo("No pude guardar el carrusel acortado", error)
  }
  return data
}

/** Whether this text was already shortened once (amendment 3): a design change keeps the shortened text's hash. */
export async function seAcortoEsteTexto(db: Db, piezaId: string, hashTexto: string): Promise<boolean> {
  const { count, error } = await db
    .from("carruseles")
    .select("id", { count: "exact", head: true })
    .eq("pieza_id", piezaId)
    .eq("hash_texto", hashTexto)
    .eq("origen", "acortado")
  if (error) throw fallo("No pude leer si el texto ya se acortó", error)
  return (count ?? 0) > 0
}

/** `rechazar_diseno_que_no_cabe` (20261027000130). Null means the piece changed meanwhile. */
export async function rechazarDisenoQueNoCabe(
  db: Db,
  entrada: { carruselId: string; versionLeida: number; explicacion: string },
): Promise<FilaDePieza | null> {
  const { data, error } = await db.rpc("rechazar_diseno_que_no_cabe", {
    p_carrusel: entrada.carruselId,
    p_version: entrada.versionLeida,
    p_explicacion: entrada.explicacion,
  })
  if (error) {
    if (error.message === ERROR_VERSION_DESFASADA) return null
    throw fallo("No pude dejar el diseño anterior", error)
  }
  return data
}
