// Same pace as the script reviewer of the course (curso-heygen.html) and coni.py.
export const PALABRAS_POR_MINUTO = 150
export const PENDIENTE = "PENDIENTE"

/** Python's `str.split()`: split on whitespace runs and drop empty pieces. */
export function palabras(texto: string): string[] {
  return texto.split(/\s+/).filter(Boolean)
}

export function estimarSegundos(texto: string): number {
  const pausas = texto.split("\n\n").length - 1
  return (palabras(texto).length / PALABRAS_POR_MINUTO) * 60 + pausas * 0.6
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
