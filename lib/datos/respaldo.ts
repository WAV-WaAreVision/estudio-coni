import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import { MAXIMO_AFIRMACIONES_DE_RESPALDO, type Respaldo } from "@/lib/dominio/respaldo"
import type { Database, Json } from "@/lib/supabase/database.types"

const esquema = z.object({
  teoria: z.object({ id: z.string(), titulo: z.string(), tesis: z.string(), porQue: z.string() }),
  afirmaciones: z.array(
    z.object({
      id: z.string(),
      texto: z.string(),
      cita: z.string(),
      aporte: z.string(),
      autor: z.string(),
      deConi: z.boolean(),
      esPersona: z.boolean(),
    }),
  ),
})

/** `piezas.respaldo` (or the answer of `respaldo_de_idea`). Only the tasks write it (`proteger_pieza` refuses Coni's session), so a shape that does not parse is a bug. */
export function leerRespaldo(valor: Json | null | undefined): Respaldo | null {
  if (valor == null) return null
  const resultado = esquema.safeParse(valor)
  if (!resultado.success) {
    throw new Error(`El respaldo guardado de la pieza no tiene el formato esperado: ${resultado.error.message}`)
  }
  return resultado.data
}

export function respaldoAJson(respaldo: Respaldo | null): Json | null {
  if (respaldo === null) return null
  const { id, titulo, tesis, porQue } = respaldo.teoria
  return {
    teoria: { id, titulo, tesis, porQue },
    afirmaciones: respaldo.afirmaciones.map((a) => ({
      id: a.id,
      texto: a.texto,
      cita: a.cita,
      aporte: a.aporte,
      autor: a.autor,
      deConi: a.deConi,
      esPersona: a.esPersona,
    })),
  }
}

/** The backing an engine idea inspires its script with; null for any other idea. Service role only. */
export async function cargarRespaldoDeIdea(db: SupabaseClient<Database>, ideaId: string): Promise<Respaldo | null> {
  const { data, error } = await db.rpc("respaldo_de_idea", {
    p_idea: ideaId,
    p_limite: MAXIMO_AFIRMACIONES_DE_RESPALDO,
  })
  if (error) throw new Error(`No pude leer el respaldo de la idea ${ideaId}: ${error.message}`, { cause: error })
  return leerRespaldo(data)
}
