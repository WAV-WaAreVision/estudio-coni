import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
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
      descripcion: z.string().optional(),
      grupo: z.enum(["problema", "puente", "solucion", "respaldo"]).optional(),
      activacion: z.enum(["alta", "media", "baja"]).optional(),
      retirado: z.boolean().optional(),
    }),
  ),
})

/** The vigente version of every closed list. A missing list is a setup fault: it throws, the material pauses. */
export async function leerVocabulario(db: Db): Promise<Vocabulario> {
  const { data, error } = await db
    .from("versiones_de_vocabulario")
    .select("id, lista, red, valores")
    .eq("estado", "vigente")
  if (error) throw falloDeBase("No pude leer las listas de etiquetas", error)
  return vocabularioDeFilas(z.array(Fila).parse(data))
}
