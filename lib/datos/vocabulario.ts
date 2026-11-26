import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import { type CatalogoDeEtiquetas, catalogoDeFilas } from "@/lib/dominio/biblioteca/etiquetas-de-afirmacion"
import { type TipoDeGancho, tiposDeGancho } from "@/lib/dominio/biblioteca/ganchos"
import { type Vocabulario, vocabularioDeFilas } from "@/lib/dominio/vocabulario"
import { falloDeBase } from "@/lib/ingesta/gasto-material"
import type { Database } from "@/lib/supabase/database.types"

type Db = SupabaseClient<Database>

const Fila = z.object({
  id: z.number(),
  lista: z.string(),
  red: z.string(),
  valores: z.array(
    z.object({
      valor: z.string(),
      etiqueta: z.string(),
      descripcion: z.string().nullish(),
      grupo: z.enum(["problema", "puente", "solucion", "respaldo"]).nullish(),
      activacion: z.enum(["alta", "media", "baja"]).nullish(),
      retirado: z.boolean().nullish(),
    }),
  ),
})

/** The jsonb of a stored value may carry nulls for what it leaves out; they are read as absent. */
export const vocabularioDeRespuesta = (data: unknown): Vocabulario => vocabularioDeFilas(z.array(Fila).parse(data))

/** The vigente version of every closed list. A missing list is a setup fault: it throws, the material pauses. */
export async function leerVocabulario(db: Db): Promise<Vocabulario> {
  const { data, error } = await db
    .from("versiones_de_vocabulario")
    .select("id, lista, red, valores")
    .eq("estado", "vigente")
  if (error) throw falloDeBase("No pude leer las listas de etiquetas", error)
  return vocabularioDeRespuesta(data)
}

/**
 * The vigente hook types with the retired ones (spec 6b): a hook or a choice may still carry a retired type, and it
 * keeps its label. `leerVocabulario` leaves them out because the extraction must not use them.
 */
export async function leerTiposDeGancho(db: Db): Promise<TipoDeGancho[]> {
  const { data, error } = await db
    .from("versiones_de_vocabulario")
    .select("id, lista, red, valores")
    .eq("estado", "vigente")
    .eq("lista", "gancho")
    .eq("red", "todas")
    .maybeSingle()
  if (error) throw new Error(`No pude leer los tipos de gancho: ${error.message}`, { cause: error })
  if (!data) throw new Error("No hay una lista vigente de tipos de gancho.")
  return tiposDeGancho(Fila.parse(data).valores)
}

/**
 * Every vigente list with its retired values (spec 6c-1): a tag may still carry a retired value and keeps its label;
 * `opcionesDe` leaves it out of what she can choose.
 */
export async function leerCatalogoDeEtiquetas(db: Db): Promise<CatalogoDeEtiquetas> {
  const { data, error } = await db
    .from("versiones_de_vocabulario")
    .select("id, lista, red, valores")
    .eq("estado", "vigente")
  if (error) throw new Error(`No pude leer las listas de etiquetas: ${error.message}`, { cause: error })
  return catalogoDeFilas(z.array(Fila).parse(data))
}
