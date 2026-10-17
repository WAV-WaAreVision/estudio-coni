import { diaLocal, instanteLocal } from "@/lib/dominio/fechas"

// What Instagram's numbers say, and how little they are allowed to say (design "Métricas y aprendizaje"): nothing is
// compared before 8 reels per group, and every comparison carries its sample size. All of it is computed here, in
// code, never by Claude.

/** No comparison between groups is shown before each group has this many reels. */
export const UMBRAL_DE_REELS = 8

/** The newest reading of one published reel. Any figure Instagram did not return is null, never zero. */
export interface ReelMedido {
  piezaId: string
  titulo: string
  /** Null for a piece that did not come from an idea: it is listed, but belongs to no theme. */
  pilar: string | null
  /** When the reel was due on Instagram (the approved time), as an ISO instant. */
  publicadoEn: string
  /** The day of the snapshot, `2026-10-09`. */
  dia: string
  alcance: number | null
  guardados: number | null
  compartidos: number | null
  comentarios: number | null
  /** `ig_reels_avg_watch_time` as Instagram returns it; read it with `segundosVistos`. */
  tiempoPromedio: number | null
}

/** Saves for every 1,000 people reached, to one decimal; unknown when either figure is missing or nobody was reached. */
export function guardadosPorMil(guardados: number | null, alcance: number | null): number | null {
  if (guardados === null || alcance === null || alcance <= 0) return null
  return Math.round((guardados / alcance) * 10_000) / 10
}

/**
 * Average watch time in whole seconds. Meta's documentation names no unit for `ig_reels_avg_watch_time`
 * (https://developers.facebook.com/docs/instagram-platform/reference/instagram-media/insights); the Reels video
 * metrics have been reported in milliseconds, so that is read here, in one place, until a real account confirms it.
 */
export function segundosVistos(bruto: number | null): number | null {
  if (bruto === null) return null
  const segundos = Math.round(bruto / 1000)
  // Under a second is what a figure in seconds would look like if read as milliseconds: better none than a wrong one.
  return segundos >= 1 ? segundos : null
}

/** A reel's saves are still adding up in its first days; the comparison of themes waits this long for each reel. */
export const DIAS_PARA_COMPARAR = 7

function partesDeDia(dia: string): { anio: number; mes: number; dia: number } {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia)
  if (!partes) throw new Error(`Día ilegible: ${dia}`)
  return { anio: Number(partes[1]), mes: Number(partes[2]), dia: Number(partes[3]) }
}

function aTexto(fecha: Date): string {
  return fecha.toISOString().slice(0, 10)
}

/** A calendar day plus `dias` (negative goes back), both as `2026-10-05`. */
export function sumarDias(dia: string, dias: number): string {
  const p = partesDeDia(dia)
  return aTexto(new Date(Date.UTC(p.anio, p.mes - 1, p.dia + dias)))
}

/** The Monday of the week that holds the instant, in the zone Coni lives in. */
export function lunesDeLaSemana(ms: number, zona: string): string {
  const hoy = diaLocal(ms, zona)
  const p = partesDeDia(hoy)
  const base = new Date(Date.UTC(p.anio, p.mes - 1, p.dia))
  const diaIso = base.getUTCDay() === 0 ? 7 : base.getUTCDay()
  return sumarDias(hoy, -(diaIso - 1))
}

export interface SemanaMedida {
  /** Monday of the week, `2026-10-05`. */
  lunes: string
  reels: ReelMedido[]
  consultas: number
  /** Clicks on the links of `/l` during the week. */
  clics: number
}

/** Weeks with something to say, newest first: reels by their publishing week, consultations and clicks by their day. */
export function agruparPorSemana(entrada: {
  reels: readonly ReelMedido[]
  /** When each consultation was noted, as ISO instants. */
  consultas: readonly string[]
  clics: readonly { dia: string; clics: number }[]
  zona: string
}): SemanaMedida[] {
  const semanas = new Map<string, SemanaMedida>()
  const de = (lunes: string): SemanaMedida => {
    const existente = semanas.get(lunes)
    if (existente) return existente
    const nueva: SemanaMedida = { lunes, reels: [], consultas: 0, clics: 0 }
    semanas.set(lunes, nueva)
    return nueva
  }
  const { zona } = entrada
  for (const reel of entrada.reels) de(lunesDeLaSemana(Date.parse(reel.publicadoEn), zona)).reels.push(reel)
  for (const instante of entrada.consultas) de(lunesDeLaSemana(Date.parse(instante), zona)).consultas += 1
  for (const clic of entrada.clics) {
    const p = partesDeDia(clic.dia)
    de(lunesDeLaSemana(Date.UTC(p.anio, p.mes - 1, p.dia, 12), "UTC")).clics += clic.clics
  }
  return [...semanas.values()]
    .map((semana) => ({
      ...semana,
      reels: [...semana.reels].sort((a, b) => Date.parse(a.publicadoEn) - Date.parse(b.publicadoEn)),
    }))
    .sort((a, b) => b.lunes.localeCompare(a.lunes))
}

export interface MesVivido {
  /** `2026-10`. */
  clave: string
  /** `octubre`. */
  nombre: string
  /** First instant of the month in the zone, and first instant of the next one (exclusive), in milliseconds. */
  desde: number
  hasta: number
}

/** The month that holds the instant, as Coni lives it: it starts and ends at her midnight, not at UTC's. */
export function limitesDelMes(ms: number, zona: string): MesVivido {
  const p = partesDeDia(diaLocal(ms, zona))
  const siguiente = new Date(Date.UTC(p.anio, p.mes, 1))
  return {
    clave: `${p.anio}-${String(p.mes).padStart(2, "0")}`,
    nombre: new Intl.DateTimeFormat("es-CL", { timeZone: "UTC", month: "long" }).format(
      new Date(Date.UTC(p.anio, p.mes - 1, 15)),
    ),
    desde: instanteLocal({ anio: p.anio, mes: p.mes, dia: 1, hora: 0, minuto: 0 }, zona),
    hasta: instanteLocal(
      { anio: siguiente.getUTCFullYear(), mes: siguiente.getUTCMonth() + 1, dia: 1, hora: 0, minuto: 0 },
      zona,
    ),
  }
}

/** How many consultations were noted in a month (`2026-10`), counting days the way Coni lives them. */
export function contarEnMes(consultas: readonly string[], mes: string, zona: string): number {
  return consultas.filter((instante) => diaLocal(Date.parse(instante), zona).startsWith(`${mes}-`)).length
}

const HORA_DE_LA_LECTURA = 7
const HORAS_DE_MARGEN = 1

/**
 * Whether the newest snapshot is the one the daily run should have written by now: yesterday's counts until the 07:00
 * run (plus an hour of margin) has had its chance, today's after it. No snapshot at all is not "late".
 */
export function metricasAlDia(entrada: { ultimoDia: string | null; ahora: number; zona: string }): boolean {
  if (entrada.ultimoDia === null) return true
  const esperado = diaLocal(entrada.ahora - (HORA_DE_LA_LECTURA + HORAS_DE_MARGEN) * 3_600_000, entrada.zona)
  return entrada.ultimoDia >= esperado
}

export interface TemaMedido {
  pilar: string
  /** Reels with a measured saves-per-1,000 figure. */
  n: number
}

export interface TemaComparado extends TemaMedido {
  /** Mean of the reels' saves per 1,000. */
  media: number
  /** 95 % interval of that mean. */
  desde: number
  hasta: number
}

export type Comparacion =
  | { estado: "sin_reels" }
  | { estado: "temprano"; umbral: number; temas: TemaMedido[] }
  | {
      estado: "comparable"
      umbral: number
      /** Only the themes that reached the threshold, best mean first. */
      temas: TemaComparado[]
      /** The themes that have not reached it: shown as progress, never compared. */
      pendientes: TemaMedido[]
      /** The best theme against the next one. */
      diferencia: {
        mayor: string
        menor: string
        valor: number
        desde: number
        hasta: number
        /** The 95 % interval of the gap leaves zero out. */
        distinguible: boolean
      }
    }

function media(valores: readonly number[]): number {
  return valores.reduce((suma, valor) => suma + valor, 0) / valores.length
}

function varianzaMuestral(valores: readonly number[]): number {
  const m = media(valores)
  return valores.reduce((suma, valor) => suma + (valor - m) ** 2, 0) / (valores.length - 1)
}

const Z_95 = 1.959964

/** Two-sided 95 % Student quantile, by the Cornish-Fisher expansion (within 0.01 of the tables from 7 degrees up). */
function cuantilT95(grados: number): number {
  const z = Z_95
  return (
    z +
    (z ** 3 + z) / (4 * grados) +
    (5 * z ** 5 + 16 * z ** 3 + 3 * z) / (96 * grados ** 2) +
    (3 * z ** 7 + 19 * z ** 5 + 17 * z ** 3 - 15 * z) / (384 * grados ** 3)
  )
}

function redondear(valor: number): number {
  return Math.round(valor * 10) / 10
}

/**
 * Themes against each other. A reel counts only when its saves per 1,000 can be computed and it has a theme. Until two
 * themes have `UMBRAL_DE_REELS` reels each, nothing is compared and the result is just the sample sizes. Once they do,
 * each theme carries its mean with a 95 % interval, and the best is set against the next with Welch's interval.
 */
export function compararTemas(reels: readonly ReelMedido[]): Comparacion {
  const porTema = new Map<string, number[]>()
  for (const reel of reels) {
    const valor = guardadosPorMil(reel.guardados, reel.alcance)
    if (reel.pilar === null || valor === null) continue
    porTema.set(reel.pilar, [...(porTema.get(reel.pilar) ?? []), valor])
  }
  if (porTema.size === 0) return { estado: "sin_reels" }

  const temas: (TemaMedido & { valores: number[] })[] = [...porTema].map(([pilar, valores]) => ({
    pilar,
    n: valores.length,
    valores,
  }))
  temas.sort((a, b) => b.n - a.n || a.pilar.localeCompare(b.pilar))
  const todos: TemaMedido[] = temas.map(({ pilar, n }) => ({ pilar, n }))

  const suficientes = temas.filter((tema) => tema.n >= UMBRAL_DE_REELS)
  if (suficientes.length < 2) return { estado: "temprano", umbral: UMBRAL_DE_REELS, temas: todos }

  const comparados: (TemaComparado & { valores: number[] })[] = suficientes
    .map((tema) => {
      const m = media(tema.valores)
      const error = Math.sqrt(varianzaMuestral(tema.valores) / tema.n) * cuantilT95(tema.n - 1)
      return { pilar: tema.pilar, n: tema.n, valores: tema.valores, media: m, desde: m - error, hasta: m + error }
    })
    .sort((a, b) => b.media - a.media || a.pilar.localeCompare(b.pilar))
  const [mejor, siguiente] = comparados
  if (!mejor || !siguiente) return { estado: "temprano", umbral: UMBRAL_DE_REELS, temas: todos }

  const varMejor = varianzaMuestral(mejor.valores) / mejor.n
  const varSiguiente = varianzaMuestral(siguiente.valores) / siguiente.n
  const errorEstandar = Math.sqrt(varMejor + varSiguiente)
  const valor = mejor.media - siguiente.media
  // Welch-Satterthwaite degrees of freedom; identical flat samples have no spread and a gap that is exactly known.
  const grados =
    errorEstandar === 0
      ? mejor.n + siguiente.n - 2
      : (varMejor + varSiguiente) ** 2 / (varMejor ** 2 / (mejor.n - 1) + varSiguiente ** 2 / (siguiente.n - 1))
  const margen = errorEstandar * cuantilT95(grados)
  const desde = valor - margen
  const hasta = valor + margen

  return {
    estado: "comparable",
    umbral: UMBRAL_DE_REELS,
    temas: comparados.map(({ pilar, n, media: m, desde: d, hasta: h }) => ({
      pilar,
      n,
      media: redondear(m),
      // Saves cannot be negative, so neither can the lowest plausible mean.
      desde: Math.max(0, redondear(d)),
      hasta: redondear(h),
    })),
    pendientes: temas.filter((tema) => tema.n < UMBRAL_DE_REELS).map(({ pilar, n }) => ({ pilar, n })),
    diferencia: {
      mayor: mejor.pilar,
      menor: siguiente.pilar,
      valor: redondear(valor),
      desde: redondear(desde),
      hasta: redondear(hasta),
      distinguible: desde > 0 || hasta < 0,
    },
  }
}
