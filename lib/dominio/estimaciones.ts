import { sinEtiquetas } from "@/lib/dominio/etiquetas"

// Same pace as the script reviewer of the course (curso-heygen.html) and coni.py.
export const PALABRAS_POR_MINUTO = 150
export const PENDIENTE = "PENDIENTE"

/**
 * Python's `str.split()` for real text, on the spoken words only: tone marks are not read, so they never count as
 * words, time or subtitle text. It differs from Python only on U+001C to U+001F and U+0085 (Python splits) and U+FEFF
 * (JS splits); neither appears in scripts.
 */
export function palabras(texto: string): string[] {
  return sinEtiquetas(texto).split(/\s+/).filter(Boolean)
}

export function estimarSegundos(texto: string): number {
  const hablado = sinEtiquetas(texto)
  const pausas = hablado.split("\n\n").length - 1
  return (palabras(hablado).length / PALABRAS_POR_MINUTO) * 60 + pausas * 0.6
}

/** Python's `round(x)`: ties go to the even integer. `Math.round` would shift some subtitles by 10 ms. */
export function redondearPar(x: number): number {
  const piso = Math.floor(x)
  const resto = x - piso
  if (resto > 0.5) return piso + 1
  if (resto < 0.5) return piso
  return piso % 2 === 0 ? piso : piso + 1
}

export function mmss(segundos: number): string {
  const s = redondearPar(segundos)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

export function pendiente(valor: string | null | undefined): boolean {
  return !valor || valor === PENDIENTE
}

/** The value, or null when it is missing or still says PENDIENTE. */
export function valorDefinido(valor: string | null | undefined): string | null {
  return valor && valor !== PENDIENTE ? valor : null
}
