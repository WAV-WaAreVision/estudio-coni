/** Vector math for topics, in plain TypeScript: the volumes (a few hundred claims per run) do not need the database. */

export function coseno(a: readonly number[], b: readonly number[]): number {
  let punto = 0
  let normaA = 0
  let normaB = 0
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    punto += x * y
    normaA += x * x
    normaB += y * y
  }
  return normaA === 0 || normaB === 0 ? 0 : punto / Math.sqrt(normaA * normaB)
}

function normalizar(v: readonly number[]): number[] {
  const norma = Math.hypot(...v)
  return norma === 0 ? [...v] : v.map((x) => x / norma)
}

/** The mean direction of the vectors, with length 1. */
export function mediaNormalizada(vectores: readonly (readonly number[])[]): number[] {
  const primero = vectores[0]
  if (!primero) throw new Error("No hay vectores para promediar.")
  const suma = Array.from({ length: primero.length }, () => 0)
  for (const v of vectores) for (let i = 0; i < suma.length; i++) suma[i] = (suma[i] ?? 0) + (v[i] ?? 0)
  return normalizar(suma)
}

/** A centroid that already stands for `n` claims takes one more: (c*n + v)/(n+1), normalized. */
export function centroideIncremental(centroide: readonly number[], n: number, v: readonly number[]): number[] {
  return normalizar(centroide.map((c, i) => c * n + (v[i] ?? 0)))
}

/** PostgREST returns a pgvector column as its text form, `[0.1,0.2,...]`. */
export function parsearVector(texto: string): number[] {
  const valor: unknown = JSON.parse(texto.startsWith("[") ? texto : "null")
  if (!Array.isArray(valor) || !valor.every((x): x is number => typeof x === "number")) {
    throw new Error("El vector no tiene el formato esperado.")
  }
  return valor
}

/** The text form PostgREST accepts for a vector column. */
export function textoDeVector(v: readonly number[]): string {
  return JSON.stringify(v)
}

/**
 * Single-link grouping: two items are in the same group when a chain of pairs, each at or above `umbral`, joins them.
 * Deterministic: ids sorted, members sorted, groups ordered by their first id.
 */
export function agruparPorSimilitud(
  items: readonly { id: string; vector: readonly number[] }[],
  umbral: number,
): string[][] {
  const ordenados = [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const unitarios = ordenados.map((item) => normalizar(item.vector))
  const raiz = ordenados.map((_, i) => i)
  const buscar = (i: number): number => {
    let actual = i
    while (raiz[actual] !== actual) {
      const padre = raiz[actual] ?? actual
      raiz[actual] = raiz[padre] ?? padre
      actual = raiz[actual] ?? actual
    }
    return actual
  }
  for (let i = 0; i < ordenados.length; i++) {
    for (let j = i + 1; j < ordenados.length; j++) {
      const a = unitarios[i]
      const b = unitarios[j]
      if (a && b && buscar(i) !== buscar(j) && coseno(a, b) >= umbral) {
        // The smaller index stays the root so groups come out in id order.
        raiz[buscar(j)] = buscar(i)
      }
    }
  }
  const grupos = new Map<number, string[]>()
  for (const [i, item] of ordenados.entries()) {
    const r = buscar(i)
    grupos.set(r, [...(grupos.get(r) ?? []), item.id])
  }
  return [...grupos.entries()].sort(([a], [b]) => a - b).map(([, ids]) => ids)
}
