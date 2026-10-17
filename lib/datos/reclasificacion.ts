import type { SupabaseClient } from "@supabase/supabase-js"
import type { ElementoPorClasificar, FilaDeReclasificacion, TipoDeElemento } from "@/lib/pilares/reclasificar"
import type { Database } from "@/lib/supabase/database.types"

type Db = SupabaseClient<Database>
const TABLA: Record<TipoDeElemento, "materiales" | "temas" | "teorias"> = {
  material: "materiales",
  tema: "temas",
  teoria: "teorias",
}
const MAXIMO_TEXTO = 600

export interface ElementoLeido extends ElementoPorClasificar {
  /** Current category slug, "" for none. */
  antes: string
}

function falla(contexto: string, error: { message: string }): Error {
  return new Error(`${contexto}: ${error.message}`, { cause: error })
}

/** PostgREST cuts a response at its row limit (1000 here) without an error: read page by page until a short page. */
const POR_PAGINA = 1000

type Pagina<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>

async function todasLasPaginas<T>(
  leer: (desde: number, hasta: number) => Pagina<T>,
  porPagina: number,
  contexto: string,
): Promise<T[]> {
  const filas: T[] = []
  let pagina: T[]
  do {
    const { data, error } = await leer(filas.length, filas.length + porPagina - 1)
    if (error) throw falla(contexto, error)
    pagina = data ?? []
    filas.push(...pagina)
  } while (pagina.length === porPagina)
  return filas
}

/** Everything whose category is a retired pillar, `general` or none: what decision 4 re-classifies (amendment 1). */
export async function leerElementosPorReclasificar(
  db: Db,
  opciones: { porPagina?: number } = {},
): Promise<ElementoLeido[]> {
  const porPagina = opciones.porPagina ?? POR_PAGINA
  const { data: categorias, error } = await db.from("categorias").select("id, slug, es_pilar, activa")
  if (error) throw falla("No pude leer las categorías", error)
  const slugPorId = new Map(categorias.map((c) => [c.id, c.slug]))
  const porReclasificar = (id: string | null) => {
    if (id === null) return true
    const c = categorias.find((x) => x.id === id)
    return c !== undefined && (c.slug === "general" || (c.es_pilar && !c.activa))
  }
  const antes = (id: string | null) => (id === null ? "" : (slugPorId.get(id) ?? ""))

  const [materiales, temas, teorias] = await Promise.all([
    todasLasPaginas(
      (desde, hasta) =>
        db
          .from("materiales")
          .select("id, titulo, autor, categoria_id, fichas(resumen)")
          .order("id")
          .range(desde, hasta),
      porPagina,
      "No pude leer los materiales",
    ),
    todasLasPaginas(
      (desde, hasta) =>
        db
          .from("temas")
          .select("id, nombre, descripcion, categoria_id")
          .is("fusionado_en", null)
          .order("id")
          .range(desde, hasta),
      porPagina,
      "No pude leer los temas",
    ),
    todasLasPaginas(
      (desde, hasta) =>
        db
          .from("teorias")
          .select("id, titulo, tesis, categoria_id")
          .eq("origen", "manual")
          .order("id")
          .range(desde, hasta),
      porPagina,
      "No pude leer las teorías",
    ),
  ])
  const recortar = (partes: (string | null | undefined)[]) => partes.filter(Boolean).join(". ").slice(0, MAXIMO_TEXTO)

  return [
    ...materiales
      .filter((m) => porReclasificar(m.categoria_id))
      .map((m) => ({
        id: m.id,
        tipo: "material" as const,
        antes: antes(m.categoria_id),
        texto: recortar([m.titulo, m.autor, m.fichas?.resumen]),
      })),
    ...temas
      .filter((t) => porReclasificar(t.categoria_id))
      .map((t) => ({
        id: t.id,
        tipo: "tema" as const,
        antes: antes(t.categoria_id),
        texto: recortar([t.nombre, t.descripcion]),
      })),
    ...teorias
      .filter((t) => porReclasificar(t.categoria_id))
      .map((t) => ({
        id: t.id,
        tipo: "teoria" as const,
        antes: antes(t.categoria_id),
        texto: recortar([t.titulo, t.tesis]),
      })),
  ]
}

/** Writes the reviewed rows. A row whose category changed after the CSV was written is skipped and reported. */
export async function aplicarReclasificacion(
  db: Db,
  filas: readonly FilaDeReclasificacion[],
): Promise<{ aplicadas: number; saltadas: { id: string; motivo: string }[] }> {
  const { data: categorias, error } = await db.from("categorias").select("id, slug")
  if (error) throw falla("No pude leer las categorías", error)
  const idPorSlug = new Map(categorias.map((c) => [c.slug, c.id]))
  const slugPorId = new Map(categorias.map((c) => [c.id, c.slug]))
  let aplicadas = 0
  const saltadas: { id: string; motivo: string }[] = []
  for (const fila of filas) {
    const tabla = TABLA[fila.tipo]
    const destino = idPorSlug.get(fila.propuesta)
    if (!destino) throw new Error(`No existe la categoría ${fila.propuesta} (fila ${fila.id}).`)
    const actual = await db.from(tabla).select("categoria_id").eq("id", fila.id).maybeSingle()
    if (actual.error) throw falla(`No pude leer ${fila.tipo} ${fila.id}`, actual.error)
    if (!actual.data) {
      saltadas.push({ id: fila.id, motivo: "ya no existe" })
      continue
    }
    const ahora = actual.data.categoria_id === null ? "" : (slugPorId.get(actual.data.categoria_id) ?? "")
    if (ahora !== fila.antes) {
      saltadas.push({
        id: fila.id,
        motivo: `su categoría cambió: ahora es ${ahora || "ninguna"}, no ${fila.antes || "ninguna"}`,
      })
      continue
    }
    if (fila.propuesta === fila.antes) continue
    const { error: errorUpdate } = await db.from(tabla).update({ categoria_id: destino }).eq("id", fila.id)
    if (errorUpdate) throw falla(`No pude mover ${fila.tipo} ${fila.id}`, errorUpdate)
    aplicadas += 1
  }
  return { aplicadas, saltadas }
}
