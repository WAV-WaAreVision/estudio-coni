import { guardarNumerosDeLinkedin, leerLinkedinParaAnotar } from "@/lib/datos/metricas-linkedin"
import { Falla } from "@/lib/dominio/falla"
import type { Anotacion } from "@/lib/metricas/linkedin"
import type { DepsAcciones } from "./piezas"
import { aResultado, type Resultado } from "./resultado"

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
    const enLista = new Set(lista.pendientes.map((post) => post.piezaId))
    if (anotacion.posts.some((post) => !enLista.has(post.piezaId))) {
      throw new Falla(
        "Uno de esos posts ya tiene sus números de esta semana o salió de la lista. Vuelve a abrir Métricas.",
      )
    }
    await guardarNumerosDeLinkedin(deps.db, { medidoEn: lista.medidoEn, semana: lista.semana, ...anotacion })
    return { anotados: anotacion.posts.length }
  })
}
