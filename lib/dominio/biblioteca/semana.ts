import { semanaDe } from "@/lib/dominio/fechas"
import { NOMBRE_DE_RED, type PilarDeRed, type Red } from "@/lib/dominio/pilares"
import { dolares } from "@/lib/formato"

// Semana, the latest run of the weekly engine (spec 2026-11-06, batch 5). Ported from Ingesta's lib/ingesta/semana.ts.

export const RUTA_DE_SEMANA = "/biblioteca/semana"

/** What «Proponer ahora» is said to cost before any run cost something (spec decision 5). */
export const COSTO_SIN_HISTORIA_USD = 0.3
const CORRIDAS_PARA_ESTIMAR = 4

/** The median of the latest runs that cost something, to the cent (4a). `costos` comes newest first. */
export function estimarCostoDelMotor(costos: readonly number[]): number {
  const conCosto = costos
    .filter((costo) => costo > 0)
    .slice(0, CORRIDAS_PARA_ESTIMAR)
    .toSorted((a, b) => a - b)
  if (conCosto.length === 0) return COSTO_SIN_HISTORIA_USD
  const mitad = Math.floor(conCosto.length / 2)
  const mediana =
    conCosto.length % 2 === 1 ? (conCosto[mitad] ?? 0) : ((conCosto[mitad - 1] ?? 0) + (conCosto[mitad] ?? 0)) / 2
  // 0.565 * 100 is 56.49999999999999 in floating point: snap to 12 significant digits so a half cent rounds up.
  // Number.EPSILON is not enough: it is lost above US$ 2.
  return Math.round(Number((mediana * 100).toPrecision(12))) / 100
}

export function textoDeCosto(usd: number): string {
  return `Cuesta cerca de ${dolares(usd)}`
}

export const YA_PROPUSO = "El motor ya propuso ideas esta semana. Puedes pedir otras desde el lunes."
export const NO_ARRANCO = "No pude pedirle ideas al motor. Inténtalo de nuevo en unos minutos."
export const MOTOR_PEDIDO = "El motor se puso a trabajar. Las ideas llegan a Ideas en unos minutos."

/** The engine retakes a run stuck in `corriendo` once it is older than this (`MINUTOS_PARA_RETOMAR`, lib/motor/semanal.ts). */
const MINUTOS_DE_UNA_CORRIDA_VIVA = 30
const MS_POR_MINUTO = 60_000

export interface CorridaDeEstaSemana {
  estado: string
  creadaEn: string
}

/**
 * «Proponer ahora» (as Ingesta): never over a ready week or a run still alive; a failed week, or a run older than the
 * engine's retake window, can be asked again, because the engine retakes it. The boundary is the engine's: strictly older.
 */
export function puedePedirMotor(corrida: CorridaDeEstaSemana | null, ahora: Date): boolean {
  if (corrida === null) return true
  if (corrida.estado === "lista") return false
  if (corrida.estado === "corriendo") {
    return (ahora.getTime() - Date.parse(corrida.creadaEn)) / MS_POR_MINUTO > MINUTOS_DE_UNA_CORRIDA_VIVA
  }
  return true
}

const ZONA = "America/Santiago"

/** A topic a theory or a crossing names, when it still exists. */
export interface TemaDeTeoria {
  id: string
  nombre: string
}

export interface CorridaLeida {
  /** The Sunday that closes the week, `2026-11-08`. */
  semana: string
  estado: string
  costoUsd: number
  ideas: number
  manual: boolean
  motivoFallo: string | null
  creadaEn: string
}

export interface TeoriaEscrita {
  id: string
  titulo: string
  tesis: string
  puntaje: number | null
  nivelEvidencia: string | null
  temas: TemaDeTeoria[]
}

export interface CruceDescartado {
  id: string
  razon: string
  temas: TemaDeTeoria[]
}

/** A single-author topic as the engine named it; `id` when a topic of that name still exists. */
export interface TemaParaSubir {
  nombre: string
  id: string | null
}

export interface PilarParaSubir {
  slug: string
  nombreCorto: string
  red: Red
}

export interface QueSubirLeido {
  unSoloAutor: TemaParaSubir[]
  pilaresSinMaterial: PilarParaSubir[]
}

export interface SemanaLeida {
  corrida: CorridaLeida | null
  teorias: TeoriaEscrita[]
  descartadas: CruceDescartado[]
  queSubir: QueSubirLeido | null
}

export const SIN_CORRIDA: SemanaLeida = { corrida: null, teorias: [], descartadas: [], queSubir: null }

export const TITULO_DE_LO_CRUZADO = "Lo que el motor cruzó esta semana"
export const SIN_CRUCES = "Esta semana el motor no encontró cruces nuevos."
export const SIN_CORRIDAS = "Todavía no corre el motor. La primera tanda llega el domingo a las 20:00."
export const TRABAJANDO = "El motor todavía está trabajando en esta semana."
export const MOTOR_NO_TERMINO = "El motor no terminó esta semana."
export const NADA_QUE_SUBIR = "Por ahora no falta nada: cada tema tiene varios autores y cada pilar tiene material."
export const A_PEDIDO = "A pedido"

export function crucesQueNoSirvieron(cantidad: number): string {
  return `Cruces que no sirvieron (${cantidad})`
}

export interface CorridaVisible {
  palabra: string
  tipo: "ok" | "neutro" | "error"
  /** The pill draws check and warning circle itself; this one it is given. */
  icono: "reloj" | null
}

const CORRIDAS: Record<string, CorridaVisible> = {
  lista: { palabra: "Lista", tipo: "ok", icono: null },
  corriendo: { palabra: "Trabajando", tipo: "neutro", icono: "reloj" },
  fallida: { palabra: "Falló", tipo: "error", icono: null },
}

/** Icon and word, never colour only (4j). The column's check allows only these three. */
export function presentarCorrida(estado: string): CorridaVisible {
  const visible = CORRIDAS[estado]
  if (!visible) throw new Error(`Estado de corrida desconocido: ${estado}`)
  return visible
}

const RESPALDOS: Record<string, string> = { alto: "fuerte", medio: "medio", debil: "débil" }

/** The theory's evidence level in her words (4h); null when the engine gave none. */
export function respaldoDeTeoria(nivel: string | null): string | null {
  if (nivel === null) return null
  const respaldo = RESPALDOS[nivel]
  if (!respaldo) throw new Error(`Nivel de evidencia desconocido: ${nivel}`)
  return `Respaldo: ${respaldo}`
}

const dosDecimales = (valor: number) =>
  valor.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** What only WAV needs about a theory, folded under it (4h, as `lineasDeIdeaParaWav`). Each line is unique: it is a key. */
export function lineasDeTeoriaParaWav(teoria: { id: string; puntaje: number | null }): string[] {
  return [...(teoria.puntaje === null ? [] : [`Puntaje: ${dosDecimales(teoria.puntaje)}`]), `Teoría: ${teoria.id}`]
}

/** `semana` is the closing Sunday as a plain date: read at noon UTC so no timezone moves it a day. */
export function tituloDeSemana(semana: string): string {
  return `Semana del ${semanaDe(Date.parse(`${semana}T12:00:00Z`), ZONA)}`
}

export function resumenDeCorrida(corrida: { ideas: number; costoUsd: number }): string {
  const ideas = corrida.ideas === 1 ? "1 idea nueva" : `${corrida.ideas} ideas nuevas`
  return `${ideas} · Costó ${dolares(corrida.costoUsd)}`
}

/** The engine stores topic names: each keeps its place, with a link only when a topic of that name still exists. */
export function temasParaSubir(nombres: readonly string[], ids: ReadonlyMap<string, string>): TemaParaSubir[] {
  return nombres.map((nombre) => ({ nombre, id: ids.get(nombre) ?? null }))
}

/**
 * The engine stores pillar slugs. Only an active pillar of a network is worth asking material for: a retired one, a
 * layer or one without a network drops out (spec decision 8).
 */
export function pilaresParaSubir(slugs: readonly string[], pilares: readonly PilarDeRed[]): PilarParaSubir[] {
  return slugs.flatMap((slug) => {
    const pilar = pilares.find((candidato) => candidato.slug === slug && !candidato.esCapa)
    return pilar ? [{ slug, nombreCorto: pilar.nombreCorto, red: pilar.red }] : []
  })
}

export function etiquetaDePilarParaSubir(pilar: PilarParaSubir): string {
  return `${pilar.nombreCorto} · ${NOMBRE_DE_RED[pilar.red]}`
}

export function nadaQueSubir(queSubir: QueSubirLeido): boolean {
  return queSubir.unSoloAutor.length === 0 && queSubir.pilaresSinMaterial.length === 0
}
