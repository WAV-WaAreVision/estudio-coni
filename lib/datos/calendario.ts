import type { SupabaseClient } from "@supabase/supabase-js"
import type { PiezaDeCalendario } from "@/lib/calendario/modelo"
import { leerPilares } from "@/lib/datos/pilares"
import { destinosDe, pendientesDe } from "@/lib/dominio/destinos"
import type { Estado } from "@/lib/dominio/estados"
import type { Horario } from "@/lib/dominio/fechas"
import type { CatalogoDePilares } from "@/lib/dominio/pilares"
import type { Database } from "@/lib/supabase/database.types"

type Db = SupabaseClient<Database>

function fallo(contexto: string, error: { message: string }): Error {
  return new Error(`${contexto}: ${error.message}`, { cause: error })
}

const PIEZAS_A_LEER = 200
const DIAS_DE_HISTORIA = 35

/** Pieces that have a place in the calendar (everything alive, and what went out in the last weeks) and the schedule. */
export async function leerDatosDeCalendario(
  db: Db,
  ahora: number,
): Promise<{
  piezas: PiezaDeCalendario[]
  horario: Horario
  primeraPublicacion: string | null
  yaPublico: boolean
  pilares: CatalogoDePilares
}> {
  const desde = new Date(ahora - DIAS_DE_HISTORIA * 86_400_000).toISOString()
  const [piezas, ajustes, primera, publicada, pilares] = await Promise.all([
    db
      .from("piezas")
      .select(
        "id, titulo, estado, puerta2_publicar_en, creada_en, destinos, ideas(pilar), publicaciones(destino, estado)",
      )
      .not("estado", "in", "(idea,descartado)")
      .or(`puerta2_publicar_en.is.null,puerta2_publicar_en.gte.${desde}`)
      .order("creada_en", { ascending: false })
      .limit(PIEZAS_A_LEER),
    db.from("ajustes").select("dias_publicacion, hora_publicacion, zona").maybeSingle(),
    // The window above is short; the rhythm needs to know when she really started.
    db
      .from("piezas")
      .select("puerta2_publicar_en")
      .in("estado", ["publicado", "programado", "para_subir_a_mano", "publicado_a_mano"])
      .not("puerta2_publicar_en", "is", null)
      .order("puerta2_publicar_en", { ascending: true })
      .limit(1)
      .maybeSingle(),
    // Decision 22: "before her first publication" is read where publishing is recorded (decision 15).
    db
      .from("publicaciones")
      .select("pieza_id")
      .in("estado", ["publicado", "subido_a_mano"])
      .limit(1),
    leerPilares(db),
  ])
  if (piezas.error) throw fallo("No pude leer las piezas del calendario", piezas.error)
  if (ajustes.error) throw fallo("No pude leer los horarios", ajustes.error)
  if (primera.error) throw fallo("No pude leer la primera publicación", primera.error)
  if (publicada.error) throw fallo("No pude saber si ya publicó", publicada.error)
  return {
    piezas: piezas.data.map((fila) => ({
      id: fila.id,
      titulo: fila.titulo,
      // The column is an enum of the same states; the database types it as that union.
      estado: fila.estado satisfies Estado,
      pilar: fila.ideas?.pilar ?? null,
      publicarEn: fila.puerta2_publicar_en,
      creadaEn: fila.creada_en,
      destinos: destinosDe(fila.destinos),
      pendientes: pendientesDe(fila.publicaciones),
    })),
    primeraPublicacion: primera.data?.puerta2_publicar_en ?? null,
    yaPublico: publicada.data.length > 0,
    pilares,
    horario: {
      dias: ajustes.data?.dias_publicacion ?? [2, 4, 6],
      hora: ajustes.data?.hora_publicacion ?? "19:00",
      zona: ajustes.data?.zona ?? "America/Santiago",
    },
  }
}
