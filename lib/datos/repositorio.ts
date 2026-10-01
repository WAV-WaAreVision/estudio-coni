import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
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

/** Findings as the plain JSON the `revision` column stores. */
export function revisionAJson(hallazgos: readonly Hallazgo[]): Json {
  return hallazgos.map((h) =>
    h.frase === undefined
      ? { regla: h.regla, tipo: h.tipo, mensaje: h.mensaje }
      : { regla: h.regla, tipo: h.tipo, mensaje: h.mensaje, frase: h.frase },
  )
}

export type Reserva = { tope: true } | { tope: false; gasto: FilaDeGasto }

/** The errors of `reservar_gasto` are its contract (supabase/migrations/20261001000400_gastos.sql). */
const ERROR_DE_TOPE = "tope_alcanzado"
const ERROR_SIN_AJUSTES = "ajustes_faltantes"

export async function reservarGasto(
  db: Db,
  reserva: {
    piezaId: string
    proveedor: "heygen" | "elevenlabs" | "anthropic"
    paso: string
    estimadoUsd: number
    clave: string
    ahora: string
  },
): Promise<Reserva> {
  const { data, error } = await db.rpc("reservar_gasto", {
    p_pieza: reserva.piezaId,
    p_proveedor: reserva.proveedor,
    p_paso: reserva.paso,
    p_estimado: reserva.estimadoUsd,
    p_clave: reserva.clave,
    p_ahora: reserva.ahora,
  })
  if (error) {
    if (error.message === ERROR_DE_TOPE) return { tope: true }
    // Without the settings row there is no cap to check, and retrying will not create it.
    if (error.message === ERROR_SIN_AJUSTES) {
      throw new FallaDeConfiguracion("Falta la fila de ajustes: sin ella no hay tope de gasto que revisar.")
    }
    throw fallo("No pude reservar el gasto", error)
  }
  return { tope: false, gasto: data }
}

export async function confirmarGasto(db: Db, clave: string, realUsd: number): Promise<void> {
  const { error } = await db.rpc("confirmar_gasto", { p_clave: clave, p_real: realUsd })
  if (error) throw fallo("No pude confirmar el gasto", error)
}

/** Releasing a reservation that is no longer `reservado` changes nothing, so it is safe to repeat. */
export async function liberarGasto(db: Db, clave: string): Promise<void> {
  const { error } = await db.rpc("liberar_gasto", { p_clave: clave })
  if (error) throw fallo("No pude liberar el gasto", error)
}

export async function leerSecreto(db: Db, nombre: string): Promise<string | null> {
  const { data, error } = await db.rpc("leer_secreto", { p_nombre: nombre })
  if (error) throw fallo(`No pude leer la llave de ${nombre}`, error)
  // A key pasted with a trailing newline is an invalid header value, which would look like a network failure.
  return data?.trim() || null
}
