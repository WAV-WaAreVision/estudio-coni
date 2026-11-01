import type { SupabaseClient } from "@supabase/supabase-js"
import { leerPilares } from "@/lib/datos/pilares"
import { esDestino } from "@/lib/dominio/destinos"
import { diaLocal } from "@/lib/dominio/fechas"
import { sumarDias } from "@/lib/dominio/metricas"
import type { EntradaDeMetricas } from "@/lib/metricas/modelo"
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

/** Deletes the click counter's visitor hashes from before `antesDe` (`2026-10-09`) and returns how many went. */
export async function olvidarVisitasDeClics(db: Db, antesDe: string): Promise<number> {
  const { data, error } = await db.rpc("olvidar_visitas_clic", { p_antes_de: antesDe })
  if (error) throw fallo("No pude olvidar las visitas del contador", error)
  return data
}

export async function guardarLecturaDeCuenta(db: Db, dia: string, toquesPerfil: number): Promise<void> {
  const { error } = await db
    .from("metricas_cuenta")
    .upsert({ dia, toques_perfil: toquesPerfil, leido_en: new Date().toISOString() }, { onConflict: "dia" })
  if (error) throw fallo("No pude guardar las métricas de la cuenta", error)
}

const DIAS_DE_HISTORIA = 7 * 12

/** Everything the Métricas screen shows, through Coni's session: row level security decides what she can read. */
export async function leerDatosDeMetricas(db: Db, ahora: number): Promise<EntradaDeMetricas> {
  const zona = await leerZona(db)
  const hoy = diaLocal(ahora, zona)
  const [publicaciones, lecturas, lecturasLinkedin, consultas, clics, pilares] = await Promise.all([
    // Decision 15: what went out is a `publicaciones` row, once per network.
    db
      .from("publicaciones")
      .select("pieza_id, destino, estado, marcado_en, piezas(titulo, puerta2_publicar_en, ideas(pilar))")
      .in("estado", ["publicado", "subido_a_mano"]),
    // One row per reel (the newest): the table keeps a row per day and would hit the API's row cap in a few months.
    db
      .from("metricas_reel_ultima")
      .select("pieza_id, dia, alcance, guardados, compartidos, comentarios, tiempo_promedio"),
    db
      .from("metricas_linkedin_ultima")
      .select("pieza_id, medido_en, impresiones, reacciones, comentarios, compartidos"),
    db
      .from("consultas")
      .select("anotada_en")
      .gte("anotada_en", new Date(ahora - DIAS_DE_HISTORIA * 86_400_000).toISOString()),
    db.from("clics_enlace_dia").select("dia, clics").gte("dia", sumarDias(hoy, -DIAS_DE_HISTORIA)),
    leerPilares(db),
  ])
  if (publicaciones.error) throw fallo("No pude leer lo publicado", publicaciones.error)
  if (lecturas.error) throw fallo("No pude leer las métricas", lecturas.error)
  if (lecturasLinkedin.error) throw fallo("No pude leer las métricas de LinkedIn", lecturasLinkedin.error)
  if (consultas.error) throw fallo("No pude leer las consultas", consultas.error)
  if (clics.error) throw fallo("No pude leer los clics", clics.error)

  const clicsPorDia = new Map<string, number>()
  for (const fila of clics.data) clicsPorDia.set(fila.dia, (clicsPorDia.get(fila.dia) ?? 0) + fila.clics)

  return {
    zona,
    ahora,
    pilares,
    publicaciones: publicaciones.data
      .flatMap((fila) => {
        const pieza = fila.piezas
        const publicadoEn = pieza?.puerta2_publicar_en ?? fila.marcado_en
        if (!pieza || !publicadoEn || !esDestino(fila.destino)) return []
        return [
          {
            piezaId: fila.pieza_id,
            titulo: pieza.titulo,
            pilar: pieza.ideas?.pilar ?? null,
            red: fila.destino,
            aMano: fila.estado === "subido_a_mano",
            publicadoEn,
          },
        ]
      })
      .sort((a, b) => Date.parse(b.publicadoEn) - Date.parse(a.publicadoEn)),
    // A view types every column as nullable; a row without its reel or its day cannot come out of the primary key.
    lecturas: lecturas.data.flatMap((fila) =>
      fila.pieza_id && fila.dia
        ? [
            {
              piezaId: fila.pieza_id,
              dia: fila.dia,
              alcance: fila.alcance,
              guardados: fila.guardados,
              compartidos: fila.compartidos,
              comentarios: fila.comentarios,
              tiempoPromedio: fila.tiempo_promedio,
            },
          ]
        : [],
    ),
    // A view types every column as nullable; a row without its post or its day cannot come out of the primary key.
    lecturasLinkedin: lecturasLinkedin.data.flatMap((fila) =>
      fila.pieza_id && fila.medido_en
        ? [
            {
              piezaId: fila.pieza_id,
              medidoEn: fila.medido_en,
              impresiones: fila.impresiones,
              reacciones: fila.reacciones,
              comentarios: fila.comentarios,
              compartidos: fila.compartidos,
            },
          ]
        : [],
    ),
    consultas: consultas.data.map((fila) => fila.anotada_en),
    clics: [...clicsPorDia].map(([dia, total]) => ({ dia, clics: total })),
  }
}
