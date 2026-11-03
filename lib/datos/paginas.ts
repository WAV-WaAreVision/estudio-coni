/**
 * PostgREST answers at most `max_rows` rows per request (`supabase/config.toml`, and the same default on the hosted
 * project), so long reads go page by page. The page size must equal it: `leerTodas` stops on a page shorter than this,
 * and a lower `max_rows` would make every page short and end the read after the first one. A unit test pins the two
 * together; looping until an empty page would cost one more request on every read, and most reads fit in one page.
 */
export const FILAS_POR_PAGINA = 1000

type Pagina<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>

/**
 * Reads every row of a query by keyset on `id`: `pagina` must order by `id`, keep rows after `despuesDe` (when not
 * null) and cap at `limite`. Unlike offsets, a row inserted or deleted meanwhile cannot shift a page, so no row is read
 * twice or skipped.
 */
export async function leerTodas<T extends { id: string }>(
  descripcion: string,
  pagina: (despuesDe: string | null, limite: number) => Pagina<T>,
): Promise<T[]> {
  const filas: T[] = []
  let despuesDe: string | null = null
  for (;;) {
    const { data, error } = await pagina(despuesDe, FILAS_POR_PAGINA)
    if (error || !data) {
      throw new Error(`No pude leer ${descripcion}: ${error?.message ?? "sin datos"}`, { cause: error })
    }
    filas.push(...data)
    const ultima = data.at(-1)
    if (data.length < FILAS_POR_PAGINA || ultima === undefined) return filas
    despuesDe = ultima.id
  }
}
