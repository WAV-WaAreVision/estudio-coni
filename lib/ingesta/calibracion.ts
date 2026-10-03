/** Pure reporting helpers for `scripts/evaluar-afirmaciones.ts`: no network, no database. */

/** The share of proposed claims whose quote was found verbatim in the chunk; null when nothing was proposed. */
export function tasaDeSupervivencia(propuestas: number, conservadas: number): number | null {
  return propuestas === 0 ? null : conservadas / propuestas
}

/** Counts per key, most frequent first. */
export function contarPor<T>(items: readonly T[], clave: (item: T) => string): [string, number][] {
  const cuentas = new Map<string, number>()
  for (const item of items) cuentas.set(clave(item), (cuentas.get(clave(item)) ?? 0) + 1)
  return [...cuentas.entries()].sort((a, b) => b[1] - a[1])
}

export interface ResumenDeGrupos {
  grupos: number
  soloUnaAfirmacion: number
  mayor: number
  deTresOMas: number
}

export function resumirGrupos(grupos: readonly (readonly string[])[]): ResumenDeGrupos {
  return {
    grupos: grupos.length,
    soloUnaAfirmacion: grupos.filter((g) => g.length === 1).length,
    mayor: grupos.reduce((m, g) => Math.max(m, g.length), 0),
    deTresOMas: grupos.filter((g) => g.length >= 3).length,
  }
}

/** The groups with at least `minimo` members, largest first. */
export function gruposGrandes(grupos: readonly (readonly string[])[], minimo: number): (readonly string[])[] {
  return grupos.filter((g) => g.length >= minimo).sort((a, b) => b.length - a.length)
}

/** `n` distinct items chosen with a Fisher-Yates shuffle over a copy; `azar` returns [0, 1). */
export function muestraAleatoria<T>(items: readonly T[], n: number, azar: () => number): T[] {
  const copia = [...items]
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1))
    const a = copia[i]
    const b = copia[j]
    if (a === undefined || b === undefined) continue
    copia[i] = b
    copia[j] = a
  }
  return copia.slice(0, n)
}

export function estimarGastoDeCalibracion(entrada: {
  tramos: number
  usdPorTramo: number
  usdEmbeddings: number
}): number {
  return entrada.tramos * entrada.usdPorTramo + entrada.usdEmbeddings
}
