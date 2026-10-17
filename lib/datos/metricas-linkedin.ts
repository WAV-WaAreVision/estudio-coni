import type { SupabaseClient } from "@supabase/supabase-js"
import { leerZona } from "@/lib/datos/metricas"
import { diaLocal } from "@/lib/dominio/fechas"
import { lunesDeLaSemana } from "@/lib/dominio/metricas"
import { type NumerosDePost, type PostPorAnotar, postsPorAnotar } from "@/lib/metricas/linkedin"
import type { Database } from "@/lib/supabase/database.types"

type Db = SupabaseClient<Database>

function fallo(contexto: string, error: { message: string }): Error {
  return new Error(`${contexto}: ${error.message}`, { cause: error })
}

export interface LinkedinParaAnotar {
  /** This week's Monday in the app's zone (`metricas_linkedin_cuenta.semana`). */
  semana: string
  /** Today in the app's zone (`metricas_linkedin.medido_en`). */
  medidoEn: string
  /** The posts of the last four weeks, with this week's manual numbers to correct. */
  posts: PostPorAnotar[]
  /** This week's followers, if already noted. */
  seguidores: number | null
  /** They came from the API or Metricool: not WAV's to change by hand. */
  seguidoresAutomaticos: boolean
}

/** What WAV notes or corrects this week. Read by Métricas (Coni's session) and the Monday reminder (service role). */
export async function leerLinkedinParaAnotar(db: Db, ahora: number): Promise<LinkedinParaAnotar> {
  const zona = await leerZona(db)
  const semana = lunesDeLaSemana(ahora, zona)
  const [posts, medidos, cuenta] = await Promise.all([
    db
      .from("publicaciones")
      .select("pieza_id, marcado_en, piezas(titulo, puerta2_publicar_en)")
      .eq("destino", "linkedin")
      .in("estado", ["publicado", "subido_a_mano"]),
    db
      .from("metricas_linkedin_ultima")
      .select("pieza_id, medido_en, origen, impresiones, reacciones, comentarios, compartidos"),
    db.from("metricas_linkedin_cuenta").select("seguidores, origen").eq("semana", semana).maybeSingle(),
  ])
  if (posts.error) throw fallo("No pude leer los posts de LinkedIn", posts.error)
  if (medidos.error) throw fallo("No pude leer los números de LinkedIn", medidos.error)
  if (cuenta.error) throw fallo("No pude leer los seguidores de LinkedIn", cuenta.error)
  return {
    semana,
    medidoEn: diaLocal(ahora, zona),
    posts: postsPorAnotar({
      posts: posts.data.flatMap((fila) => {
        const publicadoEn = fila.piezas?.puerta2_publicar_en ?? fila.marcado_en
        return fila.piezas && publicadoEn ? [{ piezaId: fila.pieza_id, titulo: fila.piezas.titulo, publicadoEn }] : []
      }),
      // A view types every column as nullable; the primary key keeps both present.
      medidos: medidos.data.flatMap((fila) =>
        fila.pieza_id && fila.medido_en && fila.origen
          ? [
              {
                piezaId: fila.pieza_id,
                medidoEn: fila.medido_en,
                origen: fila.origen,
                impresiones: fila.impresiones,
                reacciones: fila.reacciones,
                comentarios: fila.comentarios,
                compartidos: fila.compartidos,
              },
            ]
          : [],
      ),
      ahora,
      zona,
    }),
    seguidores: cuenta.data?.seguidores ?? null,
    seguidoresAutomaticos: cuenta.data ? cuenta.data.origen !== "manual" : false,
  }
}

/**
 * Manual rows only, posts and followers in one transaction (`anotar_numeros_linkedin`): `anotado_por` and `anotado_en`
 * are sealed by the database. Saving twice in a day replaces.
 */
export async function guardarNumerosDeLinkedin(
  db: Db,
  entrada: { medidoEn: string; semana: string; posts: readonly NumerosDePost[]; seguidores: number | null },
): Promise<void> {
  const { error } = await db.rpc("anotar_numeros_linkedin", {
    p_medido_en: entrada.medidoEn,
    p_semana: entrada.semana,
    p_posts: entrada.posts.map((post) => ({
      pieza_id: post.piezaId,
      impresiones: post.impresiones,
      reacciones: post.reacciones,
      comentarios: post.comentarios,
      compartidos: post.compartidos,
    })),
    ...(entrada.seguidores === null ? {} : { p_seguidores: entrada.seguidores }),
  })
  if (error) throw fallo("No pude guardar los números de LinkedIn", error)
}
