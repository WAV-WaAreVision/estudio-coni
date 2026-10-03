/** The data may hold a closing tag; `<\\/` is still `</` to a JSON reader but cannot end the data block. */
export function sinCierre(texto: string): string {
  return texto.replace(/<\/(fuente|ficha_base|candidatas|fichas)/gi, "<\\/$1")
}

/** Typographic quotes become plain ones and whitespace runs one space, so a quote survives cosmetic differences. */
function normalizarConMapa(texto: string): { normalizado: string; inicio: number[]; fin: number[] } {
  const inicio: number[] = []
  const fin: number[] = []
  let normalizado = ""
  let i = 0
  while (i < texto.length) {
    const letra = texto.charAt(i)
    if (/\s/.test(letra)) {
      let j = i
      while (j < texto.length && /\s/.test(texto.charAt(j))) j++
      normalizado += " "
      inicio.push(i)
      fin.push(j)
      i = j
      continue
    }
    normalizado += letra.replace(/[«»“”„]/g, '"').replace(/[‘’]/g, "'")
    inicio.push(i)
    fin.push(i + 1)
    i++
  }
  return { normalizado, inicio, fin }
}

/** Where `buscada` sits in `texto` once both are normalized, as offsets into `texto`; null when absent. */
export function posicionTalCual(texto: string, buscada: string): { desde: number; hasta: number } | null {
  const objetivo = normalizarConMapa(buscada).normalizado.trim()
  if (objetivo === "") return null
  const { normalizado, inicio, fin } = normalizarConMapa(texto)
  const posicion = normalizado.indexOf(objetivo)
  if (posicion === -1) return null
  const desde = inicio[posicion]
  const hasta = fin[posicion + objetivo.length - 1]
  return desde !== undefined && hasta !== undefined ? { desde, hasta } : null
}

/** The fragment of `texto` that `buscada` matches once both are normalized, as written in `texto`; null when absent. */
export function fragmentoTalCual(texto: string, buscada: string): string | null {
  const posicion = posicionTalCual(texto, buscada)
  return posicion ? texto.slice(posicion.desde, posicion.hasta) : null
}
