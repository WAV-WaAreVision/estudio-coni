import type { SupabaseClient } from "@supabase/supabase-js"
import type { BorradorDePilar, BorradorDeRed, BorradorLeido } from "@/lib/dominio/biblioteca/borradores"
import { esRed } from "@/lib/dominio/pilares"
import type { Database } from "@/lib/supabase/database.types"

type Db = SupabaseClient<Database>

const DE_PILAR = "id, red, nombre, nombre_corto, descripcion, peso"
const DE_RED = "id, nombre, manual, receta, conexion"

interface FilaDePilar {
  id: string
  red: string
  nombre: string
  nombre_corto: string
  descripcion: string
  peso: number
}

function aBorradorDePilar(fila: FilaDePilar): BorradorDePilar {
  // The column's check lets only the two networks in: anything else means the schema changed under us.
  if (!esRed(fila.red)) throw new Error(`El borrador ${fila.id} tiene una red desconocida: ${fila.red}.`)
  return {
    id: fila.id,
    red: fila.red,
    nombre: fila.nombre,
    nombreCorto: fila.nombre_corto,
    descripcion: fila.descripcion,
    peso: fila.peso,
  }
}

/** Drafts still waiting, of both kinds: the count of «Borradores · N» in Temas. */
export async function contarBorradores(db: Db): Promise<number> {
  const [pilares, redes] = await Promise.all([
    db.from("borradores_de_pilar").select("id", { count: "exact", head: true }).eq("estado", "borrador"),
    db.from("borradores_de_red").select("id", { count: "exact", head: true }).eq("estado", "borrador"),
  ])
  if (pilares.error) {
    throw new Error(`No pude contar los borradores de pilar: ${pilares.error.message}`, { cause: pilares.error })
  }
  if (redes.error)
    throw new Error(`No pude contar los borradores de red: ${redes.error.message}`, { cause: redes.error })
  return (pilares.count ?? 0) + (redes.count ?? 0)
}

/** The drafts still waiting, oldest first (decision 11). */
export async function listarBorradores(db: Db): Promise<{ pilares: BorradorDePilar[]; redes: BorradorDeRed[] }> {
  const [pilares, redes] = await Promise.all([
    db.from("borradores_de_pilar").select(DE_PILAR).eq("estado", "borrador").order("creado_en"),
    db.from("borradores_de_red").select(DE_RED).eq("estado", "borrador").order("creado_en"),
  ])
  if (pilares.error) {
    throw new Error(`No pude leer los borradores de pilar: ${pilares.error.message}`, { cause: pilares.error })
  }
  if (redes.error) throw new Error(`No pude leer los borradores de red: ${redes.error.message}`, { cause: redes.error })
  return { pilares: pilares.data.map(aBorradorDePilar), redes: redes.data }
}

/** A draft still waiting, of either kind; null when it does not exist or was already decided. */
export async function leerBorrador(db: Db, id: string): Promise<BorradorLeido | null> {
  const [pilar, red] = await Promise.all([
    db.from("borradores_de_pilar").select(DE_PILAR).eq("id", id).eq("estado", "borrador").maybeSingle(),
    db.from("borradores_de_red").select(DE_RED).eq("id", id).eq("estado", "borrador").maybeSingle(),
  ])
  if (pilar.error) throw new Error(`No pude leer el borrador ${id}: ${pilar.error.message}`, { cause: pilar.error })
  if (red.error) throw new Error(`No pude leer el borrador ${id}: ${red.error.message}`, { cause: red.error })
  if (pilar.data) return { tipo: "pilar", borrador: aBorradorDePilar(pilar.data) }
  if (red.data) return { tipo: "red", borrador: red.data }
  return null
}
