import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/database.types"
import { type CanalDeAviso, type DatosDeAviso, esCanalDeAviso, esTipoDeAviso, type TipoDeAviso } from "./tipos"

type Db = SupabaseClient<Database>
type Fila = Database["public"]["Tables"]["avisos"]["Row"]
/** A row with the kind and the channel the database already checks, typed as the app uses them. */
export type FilaDeAviso = Omit<Fila, "tipo" | "canal"> & { tipo: TipoDeAviso; canal: CanalDeAviso | null }

/** The database constrains both columns; a value outside the unions means the schema and this code disagree. */
export function aFilaDeAviso(fila: Fila): FilaDeAviso {
  if (!esTipoDeAviso(fila.tipo)) throw new Error(`El aviso ${fila.id} tiene un tipo desconocido: ${fila.tipo}.`)
  if (fila.canal !== null && !esCanalDeAviso(fila.canal)) {
    throw new Error(`El aviso ${fila.id} tiene un canal desconocido: ${fila.canal}.`)
  }
  return { ...fila, tipo: fila.tipo, canal: fila.canal }
}

function fallo(que: string, error: { message: string }): Error {
  return new Error(`No pude ${que}: ${error.message}`, { cause: error })
}

/**
 * Stores a notice once per `clave`: the same event asked again (a retried run) finds the row that is already there and
 * answers it, whatever state it is in.
 */
export async function registrarAviso(db: Db, aviso: DatosDeAviso, mensaje: string): Promise<FilaDeAviso> {
  const fila = {
    tipo: aviso.tipo,
    clave: aviso.clave,
    mensaje,
    ...(aviso.piezaId ? { pieza_id: aviso.piezaId } : {}),
  }
  const { error } = await db.from("avisos").upsert(fila, { onConflict: "clave", ignoreDuplicates: true })
  if (error) throw fallo("guardar un aviso", error)
  const { data, error: errorDeLectura } = await db.from("avisos").select("*").eq("clave", aviso.clave).single()
  if (errorDeLectura) throw fallo("leer un aviso", errorDeLectura)
  return aFilaDeAviso(data)
}

export async function marcarEnviados(
  db: Db,
  ids: readonly string[],
  canal: CanalDeAviso,
  ahora: string,
): Promise<void> {
  if (ids.length === 0) return
  const { error } = await db
    .from("avisos")
    .update({ enviado_en: ahora, canal })
    .in("id", [...ids])
  if (error) throw fallo("marcar avisos como enviados", error)
}

/** Everything not sent yet since `desde`, oldest first: what the next summary carries. */
export async function leerPendientes(db: Db, desde: string): Promise<FilaDeAviso[]> {
  const { data, error } = await db
    .from("avisos")
    .select("*")
    .is("enviado_en", null)
    .gte("creado_en", desde)
    .order("creado_en", { ascending: true })
    .order("id", { ascending: true })
  if (error) throw fallo("leer los avisos pendientes", error)
  return data.map(aFilaDeAviso)
}
