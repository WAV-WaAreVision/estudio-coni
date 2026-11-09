/**
 * Similarity under an embedding model: which models exist, the five thresholds that belong to each one and how a
 * threshold moves from one model to another (spec 2026-11-09-voyage-4-design.md). Pure.
 */

import { coseno, media } from "@/lib/ingesta/agrupar"

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
 * nearest extreme. A threshold equal to a run of tied old values takes the rank of the last of them. Identical samples return `umbral`; a sample shifted by d returns `umbral + d`.
 */
export function trasladarPorPercentil(viejos: readonly number[], nuevos: readonly number[], umbral: number): number {
  if (viejos.length < 2 || nuevos.length < 2) throw new Error("Hacen falta al menos dos muestras de cada modelo.")
  const v = ascendente(viejos)
  const w = ascendente(nuevos)
  const primeroV = v[0] ?? 0
  const ultimoV = v[v.length - 1] ?? 0
  const primeroW = w[0] ?? 0
  const ultimoW = w[w.length - 1] ?? 0
  if (umbral < primeroV) return primeroW - (primeroV - umbral)
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

/** Fewer values than this make a quantile meaningless: the threshold falls back to the claim pairs. */
export const MINIMO_DE_MUESTRAS = 20

export class MuestraInsuficiente extends Error {
  constructor(n: number) {
    super(`Hay ${n} pares de afirmaciones con vector; hacen falta ${MINIMO_DE_MUESTRAS} para calibrar.`)
    this.name = "MuestraInsuficiente"
  }
}

/** A claim with its vector under the vigente model and under the model being tried. */
export type AfirmacionParaPrueba = {
  id: string
  texto: string
  temaId: string | null
  excluida: boolean
  viejo: number[]
  nuevo: number[]
}

/** A topic with its stored (vigente-model) centroid. */
export type TemaParaPrueba = { id: string; nombre: string; fusionadoEn: string | null; viejo: number[] }

export type FuenteDeMuestras = "afirmacion_afirmacion" | "afirmacion_tema" | "tema_tema"
export type ParDeMuestras = { viejos: number[]; nuevos: number[] }
export type Muestras = Record<FuenteDeMuestras, ParDeMuestras>

export type UmbralTrasladado = { viejo: number; nuevo: number; fuente: FuenteDeMuestras; muestras: number }
export type Traslado = Record<keyof Umbrales, UmbralTrasladado>

/** Inner product: what pgvector's `<#>` negates. For unit vectors it is the cosine. */
export function punto(a: readonly number[], b: readonly number[]): number {
  let suma = 0
  for (let i = 0; i < a.length; i++) suma += (a[i] ?? 0) * (b[i] ?? 0)
  return suma
}

/**
 * The centroids the switch would write, by the rules of `aplicar_prueba_de_modelo`: the plain mean of the new vectors
 * of a topic's claims; a merged topic, the centroid of the topic it points at. An active topic none of whose claims has
 * a vector gets none (the report lists it and the switch refuses it).
 */
export function centroidesNuevos(
  temas: readonly TemaParaPrueba[],
  afirmaciones: readonly AfirmacionParaPrueba[],
): Map<string, number[]> {
  const centroides = new Map<string, number[]>()
  for (const tema of temas) {
    if (tema.fusionadoEn) continue
    const vectores = afirmaciones.filter((a) => a.temaId === tema.id && !a.excluida).map((a) => a.nuevo)
    if (vectores.length > 0) centroides.set(tema.id, media(vectores))
  }
  for (const tema of temas) {
    const destino = tema.fusionadoEn ? centroides.get(tema.fusionadoEn) : undefined
    if (destino) centroides.set(tema.id, destino)
  }
  return centroides
}

const vacio = (): ParDeMuestras => ({ viejos: [], nuevos: [] })

/** The paired samples of section «Percentile transfer, per threshold» of the plan, over non-excluded claims and active topics. */
export function muestrasDeParecido(
  afirmaciones: readonly AfirmacionParaPrueba[],
  temas: readonly TemaParaPrueba[],
  nuevos: ReadonlyMap<string, readonly number[]>,
): Muestras {
  const vivas = afirmaciones.filter((a) => !a.excluida)
  const activos = temas.flatMap((t) => {
    const nuevo = nuevos.get(t.id)
    return !t.fusionadoEn && nuevo ? [{ viejo: t.viejo, nuevo }] : []
  })
  const muestras: Muestras = { afirmacion_afirmacion: vacio(), afirmacion_tema: vacio(), tema_tema: vacio() }
  for (const [i, a] of vivas.entries()) {
    for (const b of vivas.slice(i + 1)) {
      muestras.afirmacion_afirmacion.viejos.push(punto(a.viejo, b.viejo))
      muestras.afirmacion_afirmacion.nuevos.push(punto(a.nuevo, b.nuevo))
    }
    for (const t of activos) {
      muestras.afirmacion_tema.viejos.push(punto(a.viejo, t.viejo))
      muestras.afirmacion_tema.nuevos.push(punto(a.nuevo, t.nuevo))
    }
  }
  for (const [i, x] of activos.entries()) {
    for (const y of activos.slice(i + 1)) {
      muestras.tema_tema.viejos.push(punto(x.viejo, y.viejo))
      muestras.tema_tema.nuevos.push(punto(x.nuevo, y.nuevo))
    }
  }
  return muestras
}

const acotar = (x: number): number => Math.round(Math.min(1, Math.max(0, x)) * 10_000) / 10_000

/** Each threshold moved by percentile over the sample that matches its use, or over the claim pairs when that one is small. */
export function calcularUmbrales(muestras: Muestras, vigentes: Umbrales): Traslado {
  const base = muestras.afirmacion_afirmacion
  if (base.viejos.length < MINIMO_DE_MUESTRAS) throw new MuestraInsuficiente(base.viejos.length)
  const trasladar = (clave: keyof Umbrales, preferida: FuenteDeMuestras): UmbralTrasladado => {
    const fuente = muestras[preferida].viejos.length >= MINIMO_DE_MUESTRAS ? preferida : "afirmacion_afirmacion"
    const par = muestras[fuente]
    const viejo = vigentes[clave]
    return {
      viejo,
      nuevo: acotar(trasladarPorPercentil(par.viejos, par.nuevos, viejo)),
      fuente,
      muestras: par.viejos.length,
    }
  }
  return {
    tema: trasladar("tema", "afirmacion_tema"),
    grupo: trasladar("grupo", "afirmacion_afirmacion"),
    fusion: trasladar("fusion", "tema_tema"),
    puenteMin: trasladar("puenteMin", "tema_tema"),
    puenteMax: trasladar("puenteMax", "tema_tema"),
  }
}

export function umbralesDe(traslado: Traslado): Umbrales {
  return {
    tema: traslado.tema.nuevo,
    grupo: traslado.grupo.nuevo,
    fusion: traslado.fusion.nuevo,
    puenteMin: traslado.puenteMin.nuevo,
    puenteMax: traslado.puenteMax.nuevo,
  }
}

/**
 * Mirror of `tema_mas_cercano` (20261016000100): the 10 closest topics by cosine, then the best inner product (ties by
 * id) if it reaches `umbral`.
 */
export function temaMasCercano(
  v: readonly number[],
  centroides: ReadonlyMap<string, readonly number[]>,
  umbral: number,
): { temaId: string; parecido: number } | null {
  const [mejor] = [...centroides]
    .map(([temaId, c]) => ({ temaId, distancia: 1 - coseno(v, c), parecido: punto(v, c) }))
    .sort((a, b) => a.distancia - b.distancia)
    .slice(0, 10)
    .filter((c) => c.parecido >= umbral)
    .sort((a, b) => b.parecido - a.parecido || (a.temaId < b.temaId ? -1 : 1))
  return mejor ? { temaId: mejor.temaId, parecido: mejor.parecido } : null
}
