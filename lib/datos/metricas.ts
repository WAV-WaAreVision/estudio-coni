import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/database.types"

type Db = SupabaseClient<Database>

function fallo(contexto: string, error: { message: string }): Error {
  return new Error(`${contexto}: ${error.message}`, { cause: error })
}

/** The zone the app lives in (`ajustes.zona`); Santiago when the settings row cannot be read. */
export async function leerZona(db: Db): Promise<string> {
  const { data, error } = await db.from("ajustes").select("zona").maybeSingle()
  if (error) throw fallo("No pude leer la zona horaria", error)
  return data?.zona ?? "America/Santiago"
}

export interface ReelPublicado {
  piezaId: string
  mediaId: string
}

/** Published reels that have an Instagram media to ask about, newest first. */
export async function leerReelsPublicados(db: Db): Promise<ReelPublicado[]> {
  const { data, error } = await db
    .from("piezas")
    .select("id, media_id")
    .eq("estado", "publicado")
    .not("media_id", "is", null)
    .order("puerta2_publicar_en", { ascending: false })
  if (error) throw fallo("No pude leer los reels publicados", error)
  return data.flatMap((fila) => (fila.media_id ? [{ piezaId: fila.id, mediaId: fila.media_id }] : []))
}

export interface LecturaDeReel {
  piezaId: string
  dia: string
  alcance: number | null
  guardados: number | null
  compartidos: number | null
  comentarios: number | null
  tiempoPromedio: number | null
}

/** One reading per reel per day: a second run of the same day replaces the first. */
export async function guardarLecturaDeReel(db: Db, lectura: LecturaDeReel): Promise<void> {
  const { error } = await db.from("metricas_reel").upsert(
    {
      pieza_id: lectura.piezaId,
      dia: lectura.dia,
      alcance: lectura.alcance,
      guardados: lectura.guardados,
      compartidos: lectura.compartidos,
      comentarios: lectura.comentarios,
      tiempo_promedio: lectura.tiempoPromedio,
      leido_en: new Date().toISOString(),
    },
    { onConflict: "pieza_id,dia" },
  )
  if (error) throw fallo("No pude guardar las métricas del reel", error)
}

export async function guardarLecturaDeCuenta(db: Db, dia: string, toquesPerfil: number): Promise<void> {
  const { error } = await db
    .from("metricas_cuenta")
    .upsert({ dia, toques_perfil: toquesPerfil, leido_en: new Date().toISOString() }, { onConflict: "dia" })
  if (error) throw fallo("No pude guardar las métricas de la cuenta", error)
}
