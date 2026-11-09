import type { SupabaseClient } from "@supabase/supabase-js"
import type { NumerosDelExcel, PublicacionDeLinkedin } from "@/lib/metricas/excel-linkedin/cruzar"
import type { Database } from "@/lib/supabase/database.types"

type Db = SupabaseClient<Database>

function fallo(contexto: string, error: { message: string }): Error {
  return new Error(`${contexto}: ${error.message}`, { cause: error })
}

/** Every LinkedIn row that went out, through Coni's session (only she reads `publicaciones`). */
export async function leerPublicacionesDeLinkedin(db: Db): Promise<PublicacionDeLinkedin[]> {
  const { data, error } = await db
    .from("publicaciones")
    .select("pieza_id, post_urn, marcado_en, piezas(titulo, puerta2_publicar_en)")
    .eq("destino", "linkedin")
    .in("estado", ["publicado", "subido_a_mano"])
  if (error) throw fallo("No pude leer las publicaciones de LinkedIn", error)
  return data.flatMap((fila) => {
    const publicadoEn = fila.piezas?.puerta2_publicar_en ?? fila.marcado_en
    return fila.piezas && publicadoEn
      ? [{ piezaId: fila.pieza_id, titulo: fila.piezas.titulo, postUrn: fila.post_urn, publicadoEn }]
      : []
  })
}

/**
 * The matched posts and the week's followers in one transaction (`importar_excel_linkedin`). The database seals who
 * wrote them and never changes a row from the API. Answers the post rows written.
 */
export async function guardarExcelDeLinkedin(
  db: Db,
  entrada: { medidoEn: string; semana: string; posts: readonly NumerosDelExcel[]; seguidores: number | null },
): Promise<number> {
  const { data, error } = await db.rpc("importar_excel_linkedin", {
    p_medido_en: entrada.medidoEn,
    p_semana: entrada.semana,
    p_posts: entrada.posts.map((post) => ({
      pieza_id: post.piezaId,
      impresiones: post.impresiones,
      interacciones: post.interacciones,
    })),
    ...(entrada.seguidores === null ? {} : { p_seguidores: entrada.seguidores }),
  })
  if (error) throw fallo("No pude guardar el Excel de LinkedIn", error)
  return data
}
