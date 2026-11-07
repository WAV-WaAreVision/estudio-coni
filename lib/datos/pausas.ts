import type { SupabaseClient } from "@supabase/supabase-js"
import { Falla } from "@/lib/dominio/falla"
import {
  esMotivoDePausa,
  esProveedorConPausa,
  type MotivoDePausa,
  type ProveedorConPausa,
  TEXTO_PAUSA,
  textoDePausaDeBiblioteca,
} from "@/lib/dominio/pausas"
import type { Database } from "@/lib/supabase/database.types"

type Db = SupabaseClient<Database>

function proveedorDe(valor: string): ProveedorConPausa {
  // The database constrains the column; a value outside the union means the schema and this code disagree.
  if (!esProveedorConPausa(valor)) throw new Error(`Una pausa tiene un proveedor desconocido: ${valor}.`)
  return valor
}

/** The providers paused right now. Coni's session reads them (RLS); so does `service_role`. */
export async function leerPausasAbiertas(db: Db): Promise<ProveedorConPausa[]> {
  const { data, error } = await db.from("pausas_de_proveedor").select("proveedor").is("cerrada_en", null)
  if (error) throw new Error(`No pude leer las pausas de los proveedores: ${error.message}`, { cause: error })
  return data.map((fila) => proveedorDe(fila.proveedor))
}

/** A server action refuses while one of these providers is paused: the screen she tapped may be stale. */
export async function exigirSinPausa(db: Db, ...proveedores: ProveedorConPausa[]): Promise<void> {
  const abiertas = await leerPausasAbiertas(db)
  const pausado = proveedores.find((proveedor) => abiertas.includes(proveedor))
  if (pausado) throw new Falla(TEXTO_PAUSA[pausado])
}

/** Biblioteca «Reintentar» and upload processing: only a Claude pause closes them (amendment A6). */
export async function exigirBibliotecaSinPausa(db: Db): Promise<void> {
  const texto = textoDePausaDeBiblioteca(await leerPausasAbiertas(db))
  if (texto !== null) throw new Falla(texto)
}

export interface PausaParaCerrar {
  id: string
  proveedor: ProveedorConPausa
  motivo: MotivoDePausa
}

/** For the maintenance step, with a `service_role` client. */
export async function leerPausasParaCerrar(db: Db): Promise<PausaParaCerrar[]> {
  const { data, error } = await db.from("pausas_de_proveedor").select("id, proveedor, motivo").is("cerrada_en", null)
  if (error) throw new Error(`No pude leer las pausas abiertas: ${error.message}`, { cause: error })
  return data.map((fila) => {
    if (!esMotivoDePausa(fila.motivo))
      throw new Error(`La pausa ${fila.id} tiene un motivo desconocido: ${fila.motivo}.`)
    return { id: fila.id, proveedor: proveedorDe(fila.proveedor), motivo: fila.motivo }
  })
}
