import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/database.types"
import type { IdeaDelBanco } from "./banco"

const POR_LOTE = 50

/**
 * Writes the bank into `ideas`, keyed by `numero`, so running it again updates and never duplicates. The state of an
 * idea belongs to the app once it is in the table (Coni used it, discarded it): the file only sets it for an idea
 * that was already used when the bank was written, and never puts a used idea back.
 */
export async function importarIdeas(
  db: SupabaseClient<Database>,
  ideas: readonly IdeaDelBanco[],
): Promise<{ leidas: number }> {
  // Two groups, because one upsert sends the same columns for every row: the ones that are still plain ideas leave
  // `estado` out, and a column absent from an upsert keeps the value the row already has.
  const comoFila = (idea: IdeaDelBanco) => ({
    numero: idea.numero,
    pilar: idea.pilar,
    gancho: idea.gancho,
    tema: idea.tema,
    formato: idea.formato,
    fuerza: idea.fuerza,
    alertas: idea.alertas.map(({ tipo, texto }) => ({ tipo, texto })),
    fuentes: idea.fuentes,
  })
  const usadas = ideas.filter((idea) => idea.estado === "usada").map((idea) => ({ ...comoFila(idea), estado: "usada" }))
  const sinEstado = ideas.filter((idea) => idea.estado !== "usada").map(comoFila)

  for (const grupo of [sinEstado, usadas]) {
    for (let desde = 0; desde < grupo.length; desde += POR_LOTE) {
      const lote = grupo.slice(desde, desde + POR_LOTE)
      const { error } = await db.from("ideas").upsert(lote, { onConflict: "numero" })
      if (error) {
        const numeros = lote.map((idea) => idea.numero).join(", ")
        throw new Error(`No pude guardar las ideas ${numeros}: ${error.message}`, { cause: error })
      }
    }
  }
  return { leidas: ideas.length }
}
