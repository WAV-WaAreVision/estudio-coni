import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import { esDestino, esEstadoDePublicacion, type PublicacionConEnlace } from "@/lib/dominio/destinos"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import { enlaceDePost, type FilaDeLinkedin } from "@/lib/dominio/linkedin"
import type { Alerta, Hallazgo } from "@/lib/dominio/revision"
import type { Database, Json } from "@/lib/supabase/database.types"

type Db = SupabaseClient<Database>
export type FilaDePieza = Database["public"]["Tables"]["piezas"]["Row"]
export type CambiosDePieza = Database["public"]["Tables"]["piezas"]["Update"]
export type FilaDeGasto = Database["public"]["Tables"]["gastos"]["Row"]

/** A failed read or write is a plain Error: the caller (a Trigger.dev run) retries it. */
function fallo(contexto: string, error: { message: string }): Error {
  return new Error(`${contexto}: ${error.message}`, { cause: error })
}

export async function leerPieza(db: Db, id: string): Promise<FilaDePieza | null> {
  const { data, error } = await db.from("piezas").select("*").eq("id", id).maybeSingle()
  if (error) throw fallo("No pude leer la pieza", error)
  return data
}

const Alertas = z.array(z.object({ tipo: z.string(), texto: z.string() }))

export interface IdeaLeida {
  id: string
  pilar: string
  gancho: string
  tema: string
  formato: string
  alertas: Alerta[]
}

export async function leerIdea(db: Db, id: string): Promise<IdeaLeida | null> {
  const { data, error } = await db
    .from("ideas")
    .select("id, pilar, gancho, tema, formato, alertas")
    .eq("id", id)
    .maybeSingle()
  if (error) throw fallo("No pude leer la idea", error)
  if (!data) return null
  const alertas = Alertas.safeParse(data.alertas)
  if (!alertas.success) {
    throw new FallaDeConfiguracion(`Las alertas de la idea ${id} no tienen el formato esperado (tipo y texto).`)
  }
  return { ...data, alertas: alertas.data }
}

export async function leerGuiaVigente(db: Db): Promise<{ version: number; texto: string } | null> {
  const { data, error } = await db.from("guias").select("version, texto").eq("vigente", true).maybeSingle()
  if (error) throw fallo("No pude leer la guía vigente", error)
  return data
}

/** `ajustes.produccion`, still unchecked: `leerConfigProduccion` validates it. */
export async function leerProduccion(db: Db): Promise<Json | null> {
  const { data, error } = await db.from("ajustes").select("produccion").maybeSingle()
  if (error) throw fallo("No pude leer los ajustes", error)
  return data ? data.produccion : null
}

/**
 * Optimistic-lock write: it only matches the version that was read. `cambios.version` must be that version plus
 * one (a database trigger enforces it). Null means the piece changed in the meantime.
 */
export async function actualizarPieza(
  db: Db,
  id: string,
  versionLeida: number,
  cambios: CambiosDePieza,
): Promise<FilaDePieza | null> {
  const { data, error } = await db
    .from("piezas")
    .update(cambios)
    .eq("id", id)
    .eq("version", versionLeida)
    .select()
    .maybeSingle()
  if (error) throw fallo("No pude guardar la pieza", error)
  return data
}

/** The errors of `guardar_borrador` are its contract (supabase/migrations/20261001000900_guardar_borrador.sql). */
const ERROR_VERSION_DESFASADA = "version_desfasada"

/**
 * Saves the script and confirms the Claude spend that paid for it in one transaction, so a run that dies half way
 * cannot leave the draft saved with its spend still reserved. Null means the piece changed in the meantime (the
 * same contract as `actualizarPieza`): nothing was saved and the spend stays reserved.
 */
export async function guardarBorrador(
  db: Db,
  borrador: {
    piezaId: string
    versionLeida: number
    guion: string
    texto: string
    /** The LinkedIn text written with the draft; null for a draft that has none. */
    textoLinkedin: string | null
    revision: Json
    clave: string
    realUsd: number
    respaldo: Json | null
  },
): Promise<FilaDePieza | null> {
  const { data, error } = await db.rpc("guardar_borrador", {
    p_pieza: borrador.piezaId,
    p_version: borrador.versionLeida,
    p_guion: borrador.guion,
    p_texto: borrador.texto,
    // Left out when there is none: the argument defaults to null.
    p_texto_linkedin: borrador.textoLinkedin ?? undefined,
    p_revision: borrador.revision,
    p_clave: borrador.clave,
    p_real: borrador.realUsd,
    p_respaldo: borrador.respaldo,
  })
  if (error) {
    if (error.message === ERROR_VERSION_DESFASADA) return null
    throw fallo("No pude guardar el borrador", error)
  }
  return data
}

/** Findings as the plain JSON the `revision` column stores. */
export function revisionAJson(hallazgos: readonly Hallazgo[]): Json {
  return hallazgos.map((h) => ({
    regla: h.regla,
    tipo: h.tipo,
    mensaje: h.mensaje,
    ...(h.frase === undefined ? {} : { frase: h.frase }),
    ...(h.campo === undefined ? {} : { campo: h.campo }),
  }))
}

export type Reserva = { tope: true } | { tope: false; gasto: FilaDeGasto }

/** The errors of `reservar_gasto` are its contract (supabase/migrations/20261001000400_gastos.sql). */
const ERROR_DE_TOPE = "tope_alcanzado"
const ERROR_SIN_AJUSTES = "ajustes_faltantes"

function resultadoDeReserva(error: { message: string } | null, gasto: FilaDeGasto | null): Reserva {
  if (error) {
    if (error.message === ERROR_DE_TOPE) return { tope: true }
    // Without the settings row there is no cap to check, and retrying will not create it.
    if (error.message === ERROR_SIN_AJUSTES) {
      throw new FallaDeConfiguracion("Falta la fila de ajustes: sin ella no hay tope de gasto que revisar.")
    }
    throw fallo("No pude reservar el gasto", error)
  }
  if (!gasto) throw new Error("La base no devolvió el gasto reservado.")
  return { tope: false, gasto }
}

export async function reservarGasto(
  db: Db,
  reserva: {
    piezaId: string
    proveedor: "heygen" | "elevenlabs" | "anthropic"
    paso: string
    estimadoUsd: number
    clave: string
    ahora: string
    /** Reopen a released key (only the voice, whose release means "refused, not charged"). */
    reabrir?: boolean
    /** The caller's token: the reservation it gets back is its own only when `reservado_por` matches. */
    reservadoPor?: string
  },
): Promise<Reserva> {
  const { data, error } = await db.rpc("reservar_gasto", {
    p_pieza: reserva.piezaId,
    p_proveedor: reserva.proveedor,
    p_paso: reserva.paso,
    p_estimado: reserva.estimadoUsd,
    p_clave: reserva.clave,
    p_ahora: reserva.ahora,
    p_reabrir: reserva.reabrir ?? false,
    p_reservado_por: reserva.reservadoPor,
  })
  return resultadoDeReserva(error, data)
}

/** A spend that belongs to no piece (`reservar_gasto_general`); it counts against the monthly cap all the same. */
export async function reservarGastoGeneral(
  db: Db,
  reserva: {
    proveedor: "heygen" | "elevenlabs" | "anthropic" | "voyage"
    paso: string
    estimadoUsd: number
    clave: string
    ahora: string
  },
): Promise<Reserva> {
  const { data, error } = await db.rpc("reservar_gasto_general", {
    p_proveedor: reserva.proveedor,
    p_paso: reserva.paso,
    p_estimado: reserva.estimadoUsd,
    p_clave: reserva.clave,
    p_ahora: reserva.ahora,
  })
  return resultadoDeReserva(error, data)
}

export async function confirmarGasto(db: Db, clave: string, realUsd: number): Promise<void> {
  const { error } = await db.rpc("confirmar_gasto", { p_clave: clave, p_real: realUsd })
  if (error) throw fallo("No pude confirmar el gasto", error)
}

/**
 * Releasing a reservation that is no longer `reservado` changes nothing, so it is safe to repeat. `sinCobro` only when
 * the provider refused the request: it is what lets the screen say the attempt was not charged.
 */
export async function liberarGasto(db: Db, clave: string, opciones: { sinCobro?: boolean } = {}): Promise<void> {
  const { error } = await db.rpc("liberar_gasto", { p_clave: clave, p_sin_cobro: opciones.sinCobro ?? false })
  if (error) throw fallo("No pude liberar el gasto", error)
}

export async function leerSecreto(db: Db, nombre: string): Promise<string | null> {
  const { data, error } = await db.rpc("leer_secreto", { p_nombre: nombre })
  if (error) throw fallo(`No pude leer la llave de ${nombre}`, error)
  // A key pasted with a trailing newline is an invalid header value, which would look like a network failure.
  return data?.trim() || null
}

/**
 * Hands the next due scheduled piece to this run and leases it (`tomar_para_publicar`): null when there is none, or
 * when the rest are held by another run. The returned row carries the version the lease wrote.
 */
export async function tomarParaPublicar(db: Db, ahora: string, arriendoSegundos: number): Promise<FilaDePieza | null> {
  const { data, error } = await db.rpc("tomar_para_publicar", { p_ahora: ahora, p_arriendo_segundos: arriendoSegundos })
  if (error) throw fallo("No pude tomar piezas para publicar", error)
  return data[0] ?? null
}

/** Where each destination of a piece stands (what she still has to upload, what is done). */
export async function leerPublicaciones(db: Db, piezaId: string): Promise<PublicacionConEnlace[]> {
  const { data, error } = await db
    .from("publicaciones")
    .select("destino, estado, enlace, explicacion")
    .eq("pieza_id", piezaId)
    .order("destino")
  if (error) throw fallo("No pude leer los destinos de la pieza", error)
  return data.map((fila) => {
    if (!esDestino(fila.destino)) throw new Error(`Destino desconocido en la base: ${fila.destino}`)
    if (!esEstadoDePublicacion(fila.estado)) throw new Error(`Estado de publicación desconocido: ${fila.estado}`)
    return { destino: fila.destino, estado: fila.estado, enlace: fila.enlace, explicacion: fila.explicacion }
  })
}

/** The Instagram account id (`IG_ID`) Coni connected; null until "Conectar Instagram" has been used. */
export async function leerCuentaMeta(db: Db): Promise<string | null> {
  const { data, error } = await db.from("ajustes").select("meta_cuenta_id").maybeSingle()
  if (error) throw fallo("No pude leer la cuenta de Instagram", error)
  return data?.meta_cuenta_id?.trim() || null
}

/** Pieces being rendered or subtitled that have not been written to since `antesDe` (the job of `mantenimiento`). */
export async function leerPiezasAtascadas(db: Db, antesDe: string): Promise<FilaDePieza[]> {
  const { data, error } = await db
    .from("piezas")
    .select("*")
    .in("estado", ["en_render", "subtitulando"])
    .lt("actualizada_en", antesDe)
    .order("actualizada_en")
  if (error) throw fallo("No pude leer las piezas atascadas", error)
  return data
}

/** Pieces recording their voice whose last write is older than `antesDe`: their run died or never started. */
export async function leerVocesTrabadas(db: Db, antesDe: string): Promise<FilaDePieza[]> {
  const { data, error } = await db
    .from("piezas")
    .select("*")
    .eq("estado", "grabando_voz")
    .lt("actualizada_en", antesDe)
    .order("actualizada_en")
  if (error) throw fallo("No pude leer las voces trabadas", error)
  return data
}

/** Reservations still open that were made before `antesDe`, with the piece each one belongs to (if any). */
export async function leerGastosAbiertos(
  db: Db,
  antesDe: string,
): Promise<{ gasto: FilaDeGasto; pieza: FilaDePieza | null }[]> {
  const { data: gastos, error } = await db
    .from("gastos")
    .select("*")
    .eq("estado", "reservado")
    .lt("creado_en", antesDe)
    .order("id")
  if (error) throw fallo("No pude leer los gastos abiertos", error)
  const ids = [...new Set(gastos.flatMap((gasto) => (gasto.pieza_id ? [gasto.pieza_id] : [])))]
  const piezas = new Map<string, FilaDePieza>()
  if (ids.length > 0) {
    const { data, error: errorPiezas } = await db.from("piezas").select("*").in("id", ids)
    if (errorPiezas) throw fallo("No pude leer las piezas de los gastos", errorPiezas)
    for (const pieza of data) piezas.set(pieza.id, pieza)
  }
  return gastos.map((gasto) => ({ gasto, pieza: gasto.pieza_id ? (piezas.get(gasto.pieza_id) ?? null) : null }))
}

/** Published (also by hand) or discarded pieces, last written before `antesDe`, whose files have not been deleted yet. */
export async function leerPiezasParaRetencion(db: Db, antesDe: string): Promise<FilaDePieza[]> {
  const { data, error } = await db
    .from("piezas")
    .select("*")
    .in("estado", ["publicado", "publicado_a_mano", "descartado"])
    .is("archivos_borrados_en", null)
    .lt("actualizada_en", antesDe)
    .order("actualizada_en")
  if (error) throw fallo("No pude leer las piezas para la retención", error)
  return data
}

/** When the Instagram token stops working, as Coni's connection or the last renewal set it; null when unknown. */
export async function leerExpiracionMeta(db: Db): Promise<string | null> {
  const { data, error } = await db.from("ajustes").select("meta_token_expira_en").maybeSingle()
  if (error) throw fallo("No pude leer la fecha del token de Instagram", error)
  return data?.meta_token_expira_en ?? null
}

/** Replaces the `meta` secret and moves its expiry in one transaction (`guardar_token_meta`). */
export async function guardarTokenMeta(db: Db, token: string, expiraEn: string): Promise<void> {
  const { error } = await db.rpc("guardar_token_meta", { p_token: token, p_expira_en: expiraEn })
  if (error) throw fallo("No pude guardar el token de Instagram renovado", error)
}

/**
 * Pieces whose first run never seems to have started, so it can be started again: approved for recording with no
 * render and no reason, and a script round with no reason, each quiet since its own cut-off. A reason on the piece
 * means the run did start and left a message for Coni, so those are not here.
 */
export async function leerPiezasSinArrancar(
  db: Db,
  corte: { grabarAntesDe: string; producirAntesDe: string },
): Promise<{ aGrabar: FilaDePieza[]; aProducir: FilaDePieza[] }> {
  const [aGrabar, aProducir] = await Promise.all([
    db
      .from("piezas")
      .select("*")
      .eq("estado", "en_render")
      .is("render_id", null)
      .is("explicacion", null)
      .lt("actualizada_en", corte.grabarAntesDe)
      .order("actualizada_en"),
    db
      .from("piezas")
      .select("*")
      .eq("estado", "guion_en_proceso")
      .is("explicacion", null)
      .lt("actualizada_en", corte.producirAntesDe)
      .order("actualizada_en"),
  ])
  if (aGrabar.error) throw fallo("No pude leer las piezas sin grabar", aGrabar.error)
  if (aProducir.error) throw fallo("No pude leer las piezas sin guion", aProducir.error)
  return { aGrabar: aGrabar.data, aProducir: aProducir.data }
}

export interface ConexionLinkedin {
  token: string
  miembro: string
  expiraEn: string
}

/** Null when LinkedIn was never connected or was disconnected. Expiry is judged by the caller with its clock. */
export async function leerConexionLinkedin(db: Db): Promise<ConexionLinkedin | null> {
  const token = await leerSecreto(db, "linkedin")
  const { data, error } = await db.from("ajustes").select("linkedin_miembro, linkedin_token_expira_en").maybeSingle()
  if (error) throw fallo("No pude leer la conexión de LinkedIn", error)
  if (!token || !data?.linkedin_miembro || !data.linkedin_token_expira_en) return null
  return { token, miembro: data.linkedin_miembro, expiraEn: data.linkedin_token_expira_en }
}

/** The stored expiry of the LinkedIn connection, without reading the token: the nightly warning needs no secret. */
export async function leerVencimientoLinkedin(db: Db): Promise<string | null> {
  const { data, error } = await db.from("ajustes").select("linkedin_miembro, linkedin_token_expira_en").maybeSingle()
  if (error) throw fallo("No pude leer el vencimiento de LinkedIn", error)
  return data?.linkedin_miembro ? (data.linkedin_token_expira_en ?? null) : null
}

export async function leerFilaLinkedin(db: Db, piezaId: string): Promise<FilaDeLinkedin | null> {
  const { data, error } = await db
    .from("publicaciones")
    .select("estado, video_urn, enviado_en, post_urn, intentos")
    .eq("pieza_id", piezaId)
    .eq("destino", "linkedin")
    .maybeSingle()
  if (error) throw fallo("No pude leer la fila de LinkedIn", error)
  if (!data) return null
  if (!esEstadoDePublicacion(data.estado)) throw new Error(`Estado de publicación desconocido: ${data.estado}`)
  return {
    estado: data.estado,
    videoUrn: data.video_urn,
    enviadoEn: data.enviado_en,
    postUrn: data.post_urn,
    intentos: data.intentos,
  }
}

/** Every write targets the waiting row only: a row she marked, or that fell back, is never touched again. */
async function escribirFilaLinkedin(
  db: Db,
  piezaId: string,
  cambios: Database["public"]["Tables"]["publicaciones"]["Update"],
  que: string,
): Promise<void> {
  const { data, error } = await db
    .from("publicaciones")
    .update(cambios)
    .eq("pieza_id", piezaId)
    .eq("destino", "linkedin")
    .eq("estado", "esperando")
    .select("pieza_id")
  if (error) throw fallo(`No pude ${que} en LinkedIn`, error)
  if (data.length !== 1) throw new Error(`La fila de LinkedIn de la pieza ${piezaId} dejó de esperar (${que}).`)
}

export function guardarVideoLinkedin(db: Db, piezaId: string, videoUrn: string): Promise<void> {
  return escribirFilaLinkedin(db, piezaId, { video_urn: videoUrn }, "guardar el video")
}

export async function sumarIntentoLinkedin(
  db: Db,
  piezaId: string,
  entrada: { error: string; borrarVideo: boolean },
): Promise<void> {
  const fila = await leerFilaLinkedin(db, piezaId)
  if (!fila) throw new Error(`La pieza ${piezaId} no tiene fila de LinkedIn.`)
  await escribirFilaLinkedin(
    db,
    piezaId,
    {
      intentos: fila.intentos + 1,
      ultimo_error: entrada.error.slice(0, 500),
      ...(entrada.borrarVideo ? { video_urn: null } : {}),
    },
    "contar el intento",
  )
}

/** L6.6: returns the piece version the run holds from now on. */
export async function reservarEnvioLinkedin(db: Db, piezaId: string, version: number): Promise<number> {
  const { data, error } = await db.rpc("reservar_envio_linkedin", { p_pieza: piezaId, p_version: version })
  if (error) throw fallo("No pude reservar el envío a LinkedIn", error)
  return data
}

export function guardarPostLinkedin(
  db: Db,
  piezaId: string,
  entrada: { postUrn: string; hashEnviado: string },
): Promise<void> {
  return escribirFilaLinkedin(
    db,
    piezaId,
    {
      estado: "publicado",
      post_urn: entrada.postUrn,
      enlace: enlaceDePost(entrada.postUrn),
      hash_enviado: entrada.hashEnviado,
      marcado_en: new Date().toISOString(),
      explicacion: null,
    },
    "guardar el post",
  )
}

export function pasarLinkedinAMano(
  db: Db,
  piezaId: string,
  entrada: { explicacion: string; error: string },
): Promise<void> {
  return escribirFilaLinkedin(
    db,
    piezaId,
    { estado: "para_subir", explicacion: entrada.explicacion, ultimo_error: entrada.error.slice(0, 500) },
    "dejarla para subir a mano",
  )
}
