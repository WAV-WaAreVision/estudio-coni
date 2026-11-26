import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import { Ubicacion } from "@/lib/dominio/biblioteca/ficha"
import type { GanchoDeLista } from "@/lib/dominio/biblioteca/ganchos"
import { REDES } from "@/lib/dominio/pilares"
import { CERTEZAS } from "@/lib/dominio/vocabulario"
import type { Database } from "@/lib/supabase/database.types"
import { leerTodas } from "./paginas"

type Db = SupabaseClient<Database>

const COLUMNAS =
  "afirmacion_id, frase_exacta, frase_sin_gancho, tipo, certeza, clasificado, creado_en, material_id, material_titulo, ubicacion, autor_id, autor_nombre, tema_id, tema_nombre, pilares, favorito"

// A view's columns are all nullable in the generated types: the row is checked here, once.
const FilaDeGancho = z.object({
  afirmacion_id: z.string(),
  frase_exacta: z.string(),
  frase_sin_gancho: z.string().nullable(),
  tipo: z.string(),
  certeza: z.enum(CERTEZAS).nullable(),
  clasificado: z.boolean(),
  creado_en: z.string(),
  material_id: z.string(),
  material_titulo: z.string().nullable(),
  ubicacion: z.unknown(),
  autor_id: z.string().nullable(),
  autor_nombre: z.string().nullable(),
  tema_id: z.string().nullable(),
  tema_nombre: z.string().nullable(),
  pilares: z.array(z.object({ red: z.enum(REDES), pilar_id: z.string(), nombre: z.string() })),
  favorito: z.boolean(),
})
type FilaDeGancho = z.output<typeof FilaDeGancho>

function ganchoDeFila(fila: FilaDeGancho): GanchoDeLista {
  const ubicacion = Ubicacion.safeParse(fila.ubicacion)
  return {
    afirmacionId: fila.afirmacion_id,
    fraseExacta: fila.frase_exacta,
    fraseSinGancho: fila.frase_sin_gancho,
    tipo: fila.tipo,
    certeza: fila.certeza,
    clasificado: fila.clasificado,
    creadoEn: fila.creado_en,
    material: { id: fila.material_id, titulo: fila.material_titulo },
    ubicacion: ubicacion.success ? ubicacion.data : null,
    autor: fila.autor_id && fila.autor_nombre ? { id: fila.autor_id, nombre: fila.autor_nombre } : null,
    tema: fila.tema_id && fila.tema_nombre ? { id: fila.tema_id, nombre: fila.tema_nombre } : null,
    pilares: fila.pilares.map((pilar) => ({ red: pilar.red, pilarId: pilar.pilar_id, nombre: pilar.nombre })),
    favorito: fila.favorito,
  }
}

/** Every hook Coni can see (spec 6b), page by page. The screen filters and orders them (filtros-de-ganchos.ts). */
export async function listarGanchos(db: Db): Promise<GanchoDeLista[]> {
  const filas = await leerTodas("los ganchos", (despuesDe, limite) => {
    const consulta = db.from("biblioteca_de_ganchos").select(COLUMNAS)
    return (despuesDe === null ? consulta : consulta.gt("afirmacion_id", despuesDe))
      .order("afirmacion_id")
      .limit(limite)
      .then(({ data, error }) => ({
        data: data
          ? z
              .array(FilaDeGancho)
              .parse(data)
              .map((fila) => ({ ...fila, id: fila.afirmacion_id }))
          : null,
        error,
      }))
  })
  return filas.map(ganchoDeFila)
}

/** One hook by its claim; null when the id is not a claim id or the claim has no visible hook. */
export async function leerGancho(db: Db, afirmacionId: string): Promise<GanchoDeLista | null> {
  if (!z.uuid().safeParse(afirmacionId).success) return null
  const { data, error } = await db
    .from("biblioteca_de_ganchos")
    .select(COLUMNAS)
    .eq("afirmacion_id", afirmacionId)
    .maybeSingle()
  if (error) throw new Error(`No pude leer el gancho ${afirmacionId}: ${error.message}`, { cause: error })
  return data ? ganchoDeFila(FilaDeGancho.parse(data)) : null
}

/** «Mis tipos» as stored, retired values included: `tiposPreferidosActivos` decides which still filter. */
export async function leerTiposPreferidos(db: Db): Promise<string[]> {
  const { data, error } = await db.from("ajustes").select("tipos_de_gancho_preferidos").maybeSingle()
  if (error) throw new Error(`No pude leer tus tipos de gancho: ${error.message}`, { cause: error })
  if (!data) throw new Error("Falta la fila de ajustes.")
  return data.tipos_de_gancho_preferidos
}
