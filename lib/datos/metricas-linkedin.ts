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
  pendientes: PostPorAnotar[]
  /** This week's followers, if already noted. */
  seguidores: number | null
}

/** What WAV still has to note this week. Read by Métricas (Coni's session) and the Monday reminder (service role). */
export async function leerLinkedinParaAnotar(db: Db, ahora: number): Promise<LinkedinParaAnotar> {
  const zona = await leerZona(db)
  const semana = lunesDeLaSemana(ahora, zona)
  const [posts, medidos, cuenta] = await Promise.all([
    db
      .from("publicaciones")
      .select("pieza_id, marcado_en, piezas(titulo, puerta2_publicar_en)")
      .eq("destino", "linkedin")
      .in("estado", ["publicado", "subido_a_mano"]),
    db.from("metricas_linkedin_ultima").select("pieza_id, medido_en"),
    db.from("metricas_linkedin_cuenta").select("seguidores").eq("semana", semana).maybeSingle(),
  ])
  if (posts.error) throw fallo("No pude leer los posts de LinkedIn", posts.error)
  if (medidos.error) throw fallo("No pude leer los números de LinkedIn", medidos.error)
  if (cuenta.error) throw fallo("No pude leer los seguidores de LinkedIn", cuenta.error)
  return {
    semana,
    medidoEn: diaLocal(ahora, zona),
    pendientes: postsPorAnotar({
      posts: posts.data.flatMap((fila) => {
        const publicadoEn = fila.piezas?.puerta2_publicar_en ?? fila.marcado_en
        return fila.piezas && publicadoEn ? [{ piezaId: fila.pieza_id, titulo: fila.piezas.titulo, publicadoEn }] : []
      }),
      // A view types every column as nullable; the primary key keeps both present.
      medidos: medidos.data.flatMap((fila) =>
        fila.pieza_id && fila.medido_en ? [{ piezaId: fila.pieza_id, medidoEn: fila.medido_en }] : [],
      ),
      ahora,
      zona,
    }),
    seguidores: cuenta.data?.seguidores ?? null,
  }
}

/** Manual rows only: `anotado_por` and `anotado_en` are sealed by the database. Saving twice in a day replaces. */
export async function guardarNumerosDeLinkedin(
  db: Db,
  entrada: { medidoEn: string; semana: string; posts: readonly NumerosDePost[]; seguidores: number | null },
): Promise<void> {
  if (entrada.posts.length > 0) {
    const { error } = await db.from("metricas_linkedin").upsert(
      entrada.posts.map((post) => ({
        pieza_id: post.piezaId,
        medido_en: entrada.medidoEn,
        impresiones: post.impresiones,
        reacciones: post.reacciones,
        comentarios: post.comentarios,
        compartidos: post.compartidos,
        origen: "manual",
      })),
      { onConflict: "pieza_id,medido_en" },
    )
    if (error) throw fallo("No pude guardar los números de LinkedIn", error)
  }
  if (entrada.seguidores !== null) {
    const { error } = await db
      .from("metricas_linkedin_cuenta")
      .upsert({ semana: entrada.semana, seguidores: entrada.seguidores, origen: "manual" }, { onConflict: "semana" })
    if (error) throw fallo("No pude guardar los seguidores de LinkedIn", error)
  }
}
