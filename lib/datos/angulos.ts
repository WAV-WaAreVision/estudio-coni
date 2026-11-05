import type { SupabaseClient } from "@supabase/supabase-js"
import { leerPilares } from "@/lib/datos/pilares"
import { type FaltaDeAngulo, faltasDeAngulo, type PiezaConAngulo } from "@/lib/dominio/angulos"
import type { Database } from "@/lib/supabase/database.types"

type Db = SupabaseClient<Database>

/** The published pieces with an angle. Coni's session or the service role: WAV reads no `publicaciones`. */
export async function leerPiezasConAngulo(db: Db): Promise<PiezaConAngulo[]> {
  const { data, error } = await db.from("piezas_con_angulo").select("pilar_id, angulo_id, publicada_en")
  if (error) throw new Error(`No pude leer las piezas publicadas con ángulo: ${error.message}`, { cause: error })
  // A view types every column as nullable; the view's own filters make them present.
  return data.flatMap((fila) =>
    fila.pilar_id && fila.angulo_id && fila.publicada_en
      ? [{ pilarId: fila.pilar_id, anguloId: fila.angulo_id, publicadaEn: fila.publicada_en }]
      : [],
  )
}

/** The angles that fall short at `ahora` (ms). */
export async function leerFaltasDeAngulo(db: Db, ahora: number): Promise<FaltaDeAngulo[]> {
  const [catalogo, piezas] = await Promise.all([leerPilares(db), leerPiezasConAngulo(db)])
  return faltasDeAngulo(catalogo, piezas, ahora)
}
