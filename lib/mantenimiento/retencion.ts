import type { SupabaseClient } from "@supabase/supabase-js"
import { actualizarPieza, type FilaDePieza, leerPiezasParaRetencion } from "@/lib/datos/repositorio"
import { REGLAS_DE_BORRADO } from "@/lib/datos-personales/reglas"
import type { Almacen } from "@/lib/proveedores/almacen"
import type { Database } from "@/lib/supabase/database.types"

export interface DepsRetencion {
  /** A `service_role` client. */
  db: SupabaseClient<Database>
  almacen: Almacen
  ahora: () => string
}

const DIA_MS = 86_400_000
/** Design D5: files of published and discarded pieces are kept for 30 days (the number lives in REGLAS_DE_BORRADO). */
const DIAS_DE_RETENCION = REGLAS_DE_BORRADO.videos_de_piezas

/**
 * The files a piece is allowed to lose: a published piece keeps its voice and loses its final video (design D5); a
 * discarded one loses both. A key outside the folders of that very piece is never deleted: it would mean a bad value
 * in the database, and nothing here is worth deleting someone else's file for.
 */
async function archivosABorrar(fila: FilaDePieza, almacen: Almacen): Promise<string[]> {
  const descartada = fila.estado === "descartado"
  const candidatos = [fila.video_id, ...(descartada ? [fila.audio_id] : [])]
  const claves = candidatos.filter((clave): clave is string => clave !== null)
  for (const clave of claves) {
    if (!clave.startsWith(`videos/${fila.id}/`) && !clave.startsWith(`voces/${fila.id}/`)) {
      throw new Error(`El archivo ${clave} no pertenece a la pieza ${fila.id}: no lo borro.`)
    }
  }
  // A discarded piece loses every take of its voices, not only the one it ended with: each "record again" keeps its own.
  const tomas = descartada ? (await almacen.listar(`voces/${fila.id}/`)).map((objeto) => objeto.clave) : []
  return [...new Set([...claves, ...tomas])]
}

/** Deletes the files of published and discarded pieces 30 days after they reached that state. */
export async function aplicarRetencion(deps: DepsRetencion): Promise<{ piezas: number; archivos: number }> {
  const ahora = Date.parse(deps.ahora())
  // A published or discarded piece is not written to again, so its last write is when it reached the state.
  const filas = await leerPiezasParaRetencion(deps.db, new Date(ahora - DIAS_DE_RETENCION * DIA_MS).toISOString())
  let piezas = 0
  let archivos = 0
  const errores: Error[] = []
  for (const fila of filas) {
    try {
      const claves = await archivosABorrar(fila, deps.almacen)
      for (const clave of claves) await deps.almacen.borrar(clave)
      const marcada = await actualizarPieza(deps.db, fila.id, fila.version, {
        archivos_borrados_en: new Date(ahora).toISOString(),
        version: fila.version + 1,
      })
      // Null: the piece changed in the meantime. Its files are already gone; the next night marks it.
      if (marcada) piezas += 1
      archivos += claves.length
    } catch (error) {
      if (!(error instanceof Error)) throw error
      // One bad piece must not stop the rest, night after night.
      errores.push(error)
    }
  }
  if (errores.length > 0) {
    throw new AggregateError(errores, `La retención tuvo problemas: ${errores.map((e) => e.message).join(" | ")}`)
  }
  return { piezas, archivos }
}
