/**
 * Similarity under an embedding model: which models exist, the five thresholds that belong to each one and how a
 * threshold moves from one model to another (spec 2026-11-09-voyage-4-design.md). Pure.
 */

/** The embedding models Conidolly can run. Vectors of one are never compared with vectors of the other. */
export const MODELOS_DE_HUELLAS = ["voyage-3.5", "voyage-4"] as const
export type ModeloDeHuellas = (typeof MODELOS_DE_HUELLAS)[number]

/** All on the mean-cosine scale of docs/superpowers/notas/calibracion-c1.md. */
export type Umbrales = {
  /** A claim joins a topic (`tema_mas_cercano`). */
  tema: number
  /** Pending claims group into a new topic (`agruparPorSimilitud`). */
  grupo: number
  /** Two topics are candidates to merge (`temas_parecidos`). */
  fusion: number
  /** The engine's bridge band between two topics (`puntuarPar`). */
  puenteMin: number
  puenteMax: number
}

export type Calibracion = Umbrales & { version: number; modelo: ModeloDeHuellas }

/** Version 1, seeded by 20261111000100: the values measured for voyage-3.5 in calibracion-c1.md. */
export const CALIBRACION_INICIAL: Calibracion = {
  version: 1,
  modelo: "voyage-3.5",
  tema: 0.8,
  grupo: 0.8,
  fusion: 0.8,
  puenteMin: 0.6,
  puenteMax: 0.8,
}

const ascendente = (valores: readonly number[]): number[] => [...valores].sort((a, b) => a - b)

/**
 * The new-model value that sits at the same empirical quantile `umbral` has among the old-model values. Inside the
 * old range the rank is interpolated linearly between neighbours; outside it the threshold keeps its distance to the
 * nearest extreme. Identical samples return `umbral`; a sample shifted by d returns `umbral + d`.
 */
export function trasladarPorPercentil(viejos: readonly number[], nuevos: readonly number[], umbral: number): number {
  if (viejos.length < 2 || nuevos.length < 2) throw new Error("Hacen falta al menos dos muestras de cada modelo.")
  const v = ascendente(viejos)
  const w = ascendente(nuevos)
  const primeroV = v[0] ?? 0
  const ultimoV = v[v.length - 1] ?? 0
  const primeroW = w[0] ?? 0
  const ultimoW = w[w.length - 1] ?? 0
  if (umbral <= primeroV) return primeroW - (primeroV - umbral)
  if (umbral >= ultimoV) return ultimoW + (umbral - ultimoV)
  let i = 0
  while ((v[i + 1] ?? Number.POSITIVE_INFINITY) <= umbral) i++
  const abajo = v[i] ?? primeroV
  const arriba = v[i + 1] ?? ultimoV
  const rango = (i + (umbral - abajo) / (arriba - abajo)) / (v.length - 1)
  const posicion = rango * (w.length - 1)
  const j = Math.floor(posicion)
  const desde = w[j] ?? ultimoW
  const hasta = w[j + 1] ?? desde
  return desde + (posicion - j) * (hasta - desde)
}
