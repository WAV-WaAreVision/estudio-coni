import type { SupabaseClient } from "@supabase/supabase-js"
import { destinosDe, pendientesDe } from "@/lib/dominio/destinos"
import { tipoDePieza } from "@/lib/dominio/estados"
import type { IdeaDelBanco } from "@/lib/dominio/ideas"
import type { PiezaDeInicio } from "@/lib/inicio/modelo"
import type { Database } from "@/lib/supabase/database.types"

type Db = SupabaseClient<Database>

export interface IdeaLeidaParaInicio extends IdeaDelBanco {
  gancho: string
}

export interface DatosDeInicio {
  piezas: PiezaDeInicio[]
  /** Pillars of the pieces started in the last 30 days, one per piece. */
  recientes: IdeaDelBanco["pilar"][]
  banco: IdeaLeidaParaInicio[]
  zona: string
  /** The weekly engine's switch (Ajustes › Presupuesto): off, Inicio promises no new ideas. */
  motorSemanalActivo: boolean
}

const DIAS_RECIENTES_MS = 30 * 24 * 60 * 60 * 1000
const PIEZAS_A_LEER = 80

function fallo(contexto: string, error: { message: string }): Error {
  return new Error(`${contexto}: ${error.message}`, { cause: error })
}

// The column is checked in the database; this narrows the type and fails loudly if that ever changes.
function fuerzaDe(valor: string): IdeaDelBanco["fuerza"] {
  if (valor === "alta" || valor === "media" || valor === "baja") return valor
  throw new Error(`Fuerza de idea desconocida: ${valor}`)
}

/** Everything Inicio shows, through Coni's session: row level security decides what she can read. */
export async function leerDatosDeInicio(db: Db, ahora: number): Promise<DatosDeInicio> {
  const [piezas, ideas, ajustes] = await Promise.all([
    db
      .from("piezas")
      .select(
        "id, tipo, titulo, estado, explicacion, guion, puerta2_publicar_en, permalink, actualizada_en, creada_en, destinos, ideas(pilar), publicaciones(destino, estado)",
      )
      .not("estado", "in", "(idea,descartado)")
      .order("actualizada_en", { ascending: false })
      .limit(PIEZAS_A_LEER),
    db.from("ideas").select("id, gancho, pilar, fuerza, numero, fijada_en").eq("estado", "idea"),
    db.from("ajustes").select("zona, motor_semanal_activo").maybeSingle(),
  ])
  if (piezas.error) throw fallo("No pude leer las piezas", piezas.error)
  if (ideas.error) throw fallo("No pude leer las ideas", ideas.error)
  if (ajustes.error) throw fallo("No pude leer los ajustes", ajustes.error)

  const desde = ahora - DIAS_RECIENTES_MS
  return {
    piezas: piezas.data.map((fila) => ({
      tipo: tipoDePieza(fila.tipo),
      id: fila.id,
      titulo: fila.titulo,
      estado: fila.estado,
      explicacion: fila.explicacion,
      guion: fila.guion,
      pilar: fila.ideas?.pilar ?? null,
      publicarEn: fila.puerta2_publicar_en,
      permalink: fila.permalink,
      actualizadaEn: fila.actualizada_en,
      destinos: destinosDe(fila.destinos),
      pendientes: pendientesDe(fila.publicaciones),
    })),
    recientes: piezas.data.flatMap((fila) =>
      fila.ideas && Date.parse(fila.creada_en) >= desde ? [fila.ideas.pilar] : [],
    ),
    banco: ideas.data.map(({ fijada_en, ...idea }) => ({
      ...idea,
      fuerza: fuerzaDe(idea.fuerza),
      fijada: fijada_en !== null,
    })),
    zona: ajustes.data?.zona ?? "America/Santiago",
    motorSemanalActivo: ajustes.data?.motor_semanal_activo ?? true,
  }
}
