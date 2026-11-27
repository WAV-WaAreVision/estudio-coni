import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import { type AfirmacionLeida, CAMPOS } from "@/lib/dominio/biblioteca/etiquetas-de-afirmacion"
import {
  type ItemDeLote,
  MOTIVOS_DE_DUDA,
  pendientesDeLote,
  type TarjetaDeEtiqueta,
  tarjetaDeItem,
} from "@/lib/dominio/biblioteca/lote-de-etiquetas"
import type { Database } from "@/lib/supabase/database.types"
import { leerAfirmacion } from "./afirmaciones"
import { leerCatalogoDeEtiquetas } from "./vocabulario"

type Db = SupabaseClient<Database>

// Checked once here: the generated types say text where the table's checks say a closed set.
const FilaDeLote = z.object({
  posicion: z.number().int(),
  afirmacion_id: z.string(),
  campo: z.enum(CAMPOS),
  red: z.enum(["linkedin", "instagram", "todas"]),
  marca_id: z.string().nullable(),
  motivo: z.enum(MOTIVOS_DE_DUDA),
  hecha: z.boolean(),
})

/** The week's batch (spec 6c-2), in order. Coni's first read of the week builds it. */
export async function leerLoteDeLaSemana(db: Db): Promise<ItemDeLote[]> {
  const { data, error } = await db.rpc("lote_de_la_semana")
  if (error) throw new Error(`No pude leer el lote de etiquetas de la semana: ${error.message}`, { cause: error })
  return z
    .array(FilaDeLote)
    .parse(data)
    .map((fila) => ({
      posicion: fila.posicion,
      afirmacionId: fila.afirmacion_id,
      campo: fila.campo,
      red: fila.red,
      marcaId: fila.marca_id,
      motivo: fila.motivo,
      hecha: fila.hecha,
    }))
}

/** Inicio opens even when this read fails (as the merges line): the failure is logged and counts 0. */
export async function contarEtiquetasParaInicio(db: Db): Promise<number> {
  try {
    return pendientesDeLote(await leerLoteDeLaSemana(db))
  } catch (error) {
    console.error("No pude contar las etiquetas para revisar para Inicio", error)
    return 0
  }
}

export type RevisionDeEtiquetas =
  | { estado: "lista"; items: ItemDeLote[]; tarjetas: TarjetaDeEtiqueta[] }
  | { estado: "error" }

/** The batch with one card per item; a failure is logged and the page says it in her words. */
export async function leerRevisionDeEtiquetas(db: Db): Promise<RevisionDeEtiquetas> {
  try {
    const items = await leerLoteDeLaSemana(db)
    if (items.length === 0) return { estado: "lista", items, tarjetas: [] }
    const ids = [...new Set(items.map((item) => item.afirmacionId))]
    const [afirmaciones, catalogo] = await Promise.all([
      Promise.all(ids.map((id) => leerAfirmacion(db, id))),
      leerCatalogoDeEtiquetas(db),
    ])
    const porId = new Map<string, AfirmacionLeida>(
      afirmaciones.flatMap((afirmacion) => (afirmacion ? [[afirmacion.id, afirmacion] as const] : [])),
    )
    const tarjetas = items.flatMap((item) => {
      const tarjeta = tarjetaDeItem(item, porId.get(item.afirmacionId) ?? null, catalogo)
      return tarjeta ? [tarjeta] : []
    })
    return { estado: "lista", items, tarjetas }
  } catch (error) {
    console.error("No pude cargar las etiquetas para revisar", error)
    return { estado: "error" }
  }
}
