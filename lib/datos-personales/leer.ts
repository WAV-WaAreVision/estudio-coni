import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/database.types"
import { venceLaRevision } from "./revision"

type Db = SupabaseClient<Database>

function fallo(que: string, error: { message: string }): Error {
  return new Error(`No pude leer ${que}: ${error.message}`, { cause: error })
}

export interface FechasDeRevision {
  /** When Coni last tapped «Lo revisé», or null. */
  ultima: string | null
  /** `ajustes.inventario_desde`: the base of the first review. */
  desde: string
  zona: string
  /** The due date already notified, or null. */
  avisada: string | null
}

/** What the yearly review is computed from. Works with Coni's session or with `service_role`. */
export async function leerFechasDeRevision(db: Db): Promise<FechasDeRevision> {
  const [revision, ajustes] = await Promise.all([
    db
      .from("revisiones_de_inventario")
      .select("revisado_en")
      .order("revisado_en", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db.from("ajustes").select("zona, inventario_desde, revision_de_inventario_avisada").single(),
  ])
  if (revision.error) throw fallo("la última revisión del registro", revision.error)
  if (ajustes.error) throw fallo("los ajustes", ajustes.error)
  return {
    ultima: revision.data?.revisado_en ?? null,
    desde: ajustes.data.inventario_desde,
    zona: ajustes.data.zona,
    avisada: ajustes.data.revision_de_inventario_avisada,
  }
}

export type FilaDelInventario = Pick<
  Database["public"]["Tables"]["inventario_de_datos"]["Row"],
  "clave" | "dato" | "para_que" | "proveedor" | "pais" | "pais_confirmado" | "plazo" | "regla_de_borrado" | "plazo_dias"
>

export interface BorradoAnotado {
  id: string
  regla: string
  cantidad: number
  borradoEn: string
}

export interface RegistroDeDatos {
  filas: FilaDelInventario[]
  /** The latest rows of `registro_de_borrados`, newest first. */
  borrados: BorradoAnotado[]
  ultimaRevision: string | null
  /** The day the next review is due (`2027-11-15`). */
  vence: string
  zona: string
}

const BORRADOS_A_MOSTRAR = 10

/** What Ajustes › Datos personales shows, read with Coni's session. */
export async function leerRegistroDeDatos(db: Db): Promise<RegistroDeDatos> {
  const [inventario, borrados, fechas] = await Promise.all([
    db
      .from("inventario_de_datos")
      .select("clave, dato, para_que, proveedor, pais, pais_confirmado, plazo, regla_de_borrado, plazo_dias")
      .order("orden"),
    db
      .from("registro_de_borrados")
      .select("id, regla, cantidad, borrado_en")
      .order("borrado_en", { ascending: false })
      .limit(BORRADOS_A_MOSTRAR),
    leerFechasDeRevision(db),
  ])
  if (inventario.error) throw fallo("el registro de datos personales", inventario.error)
  if (borrados.error) throw fallo("los borrados", borrados.error)
  return {
    filas: inventario.data,
    borrados: borrados.data.map((fila) => ({
      id: fila.id,
      regla: fila.regla,
      cantidad: fila.cantidad,
      borradoEn: fila.borrado_en,
    })),
    ultimaRevision: fechas.ultima,
    vence: venceLaRevision(fechas),
    zona: fechas.zona,
  }
}
