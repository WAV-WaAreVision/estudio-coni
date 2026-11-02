/** PostgREST answers at most this many rows per request (`max_rows`), so long reads go page by page. */
export const FILAS_POR_PAGINA = 1000

type Pagina<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>

/** Reads every row of a query, a page at a time; `pagina` must order its rows so the pages do not overlap. */
export async function leerTodas<T>(descripcion: string, pagina: (desde: number, hasta: number) => Pagina<T>) {
  const filas: T[] = []
  for (let desde = 0; ; desde += FILAS_POR_PAGINA) {
    const { data, error } = await pagina(desde, desde + FILAS_POR_PAGINA - 1)
    if (error || !data) {
      throw new Error(`No pude leer ${descripcion}: ${error?.message ?? "sin datos"}`, { cause: error })
    }
    filas.push(...data)
    if (data.length < FILAS_POR_PAGINA) return filas
  }
}
