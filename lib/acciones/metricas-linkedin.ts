import { z } from "zod"
import { guardarNumerosDeLinkedin, leerLinkedinParaAnotar } from "@/lib/datos/metricas-linkedin"
import { Falla } from "@/lib/dominio/falla"
import type { Anotacion } from "@/lib/metricas/linkedin"
import type { DepsAcciones } from "./piezas"
import { aResultado, type Resultado } from "./resultado"

const CIFRA = z.number().int().min(0).max(999_999_999)

/** What the Server Action accepts: one row per post (a post twice would make the upsert ambiguous). */
export const ESQUEMA_DE_ANOTACION = z.object({
  posts: z
    .array(
      z.object({ piezaId: z.uuid(), impresiones: CIFRA, reacciones: CIFRA, comentarios: CIFRA, compartidos: CIFRA }),
    )
    .max(50)
    .refine((posts) => new Set(posts.map((post) => post.piezaId)).size === posts.length, "Un post va una sola vez."),
  seguidores: CIFRA.nullable(),
})

/** WAV's weekly LinkedIn numbers (decision 19). Only posts still pending this week; the database seals who wrote them. */
export async function anotarNumerosDeLinkedin(
  deps: Pick<DepsAcciones, "db" | "ahora">,
  anotacion: Anotacion,
): Promise<Resultado<{ anotados: number }>> {
  return aResultado("anotarNumerosDeLinkedin", async () => {
    if (anotacion.posts.length === 0 && anotacion.seguidores === null) {
      throw new Falla("Anota al menos un post o los seguidores.")
    }
    const lista = await leerLinkedinParaAnotar(deps.db, Date.parse(deps.ahora()))
    const enLista = new Set(lista.posts.map((post) => post.piezaId))
    if (anotacion.posts.some((post) => !enLista.has(post.piezaId))) {
      throw new Falla("Uno de esos posts ya no está entre los de las últimas 4 semanas. Vuelve a abrir Métricas.")
    }
    await guardarNumerosDeLinkedin(deps.db, { medidoEn: lista.medidoEn, semana: lista.semana, ...anotacion })
    return { anotados: anotacion.posts.length }
  })
}
