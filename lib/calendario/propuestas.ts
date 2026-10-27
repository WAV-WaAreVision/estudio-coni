import type { Estado } from "@/lib/dominio/estados"
import { type Horario, proponerFechas } from "@/lib/dominio/fechas"

// Decision 25 (amendments A7 to A9): where every piece that has not passed gate 2 goes. A proposal is a suggestion
// nothing signs: gate 2 signs the date and a signed piece always wins its slot. The Agenda, Repartir and the gates all
// read these functions, so what she sees is what gets stored.

/** Before gate 2, the closest to publishing first: the order the Agenda places them in and Repartir stores them. */
export const ORDEN_SIN_FECHA: Partial<Record<Estado, number>> = {
  video_por_aprobar: 0,
  // A carousel (design 2026-10-26): at gate 2 like a video to approve, signed and being made like a video in render.
  carrusel_por_aprobar: 0,
  armando_carrusel: 1,
  subtitulando: 1,
  en_render: 1,
  grabando_voz: 1,
  error_produccion: 2,
  guion_aprobado: 2,
  guion_por_aprobar: 3,
  guion_en_proceso: 4,
}

/** Pieces with a signed time: their slot is taken. */
export const ESTADOS_FECHADOS: readonly Estado[] = ["publicado", "programado", "para_subir_a_mano", "publicado_a_mano"]

/** The Agenda offers slots at least this far ahead (design, "Calendario"). */
export const ANTELACION_DE_AGENDA_MS = 2 * 60 * 60 * 1000
/** How far ahead a changed proposal may land, in slots. */
const HUECOS_A_REVISAR = 60

export interface PiezaConFechas {
  id: string
  estado: Estado
  creadaEn: string
  /** The time signed at gate 2. */
  publicarEn: string | null
  /** Her stored proposal (`fechas_propuestas`), live or not. */
  fechaPropuesta: string | null
}

export interface Lugar {
  piezaId: string
  instante: string
  /** Her stored proposal; false is a place the Agenda only shows. */
  guardada: boolean
}

export function sinFechaFirmada(estado: Estado): boolean {
  return ORDEN_SIN_FECHA[estado] !== undefined
}

export function fechasTomadas(piezas: readonly Pick<PiezaConFechas, "estado" | "publicarEn">[]): string[] {
  return piezas.flatMap((pieza) =>
    ESTADOS_FECHADOS.includes(pieza.estado) && pieza.publicarEn !== null ? [pieza.publicarEn] : [],
  )
}

/** A stored proposal holds while it is `antelacionMs` ahead and no signed piece has its time; otherwise null. */
export function propuestaVigente(
  propuesta: string | null,
  entrada: { ahora: number; tomadas: ReadonlySet<number>; antelacionMs: number },
): string | null {
  if (propuesta === null) return null
  const instante = Date.parse(propuesta)
  if (Number.isNaN(instante)) return null
  if (instante < entrada.ahora + entrada.antelacionMs || entrada.tomadas.has(instante)) return null
  return new Date(instante).toISOString()
}

/**
 * The other pieces' stored proposals that still hold their time (A8 and A9): at least the Agenda's margin ahead and no
 * signed piece there. The gates keep those times for them; signing one anyway is allowed (a signed piece wins).
 */
export function propuestasVivas(
  otras: readonly string[],
  entrada: { ahora: number; tomadas: ReadonlySet<number> },
): string[] {
  return otras.flatMap((propuesta) => {
    const vigente = propuestaVigente(propuesta, { ...entrada, antelacionMs: ANTELACION_DE_AGENDA_MS })
    return vigente === null ? [] : [vigente]
  })
}

/** What a gate keeps free: the signed times and the other pieces' live proposals. */
export function ocupadasEnLaPuerta(
  contexto: { ocupadas: readonly string[]; otrasPropuestas: readonly string[] },
  ahora: number,
): string[] {
  const tomadas = new Set(contexto.ocupadas.map((iso) => Date.parse(iso)))
  return [...contexto.ocupadas, ...propuestasVivas(contexto.otrasPropuestas, { ahora, tomadas })]
}

function enOrden(piezas: readonly PiezaConFechas[]): PiezaConFechas[] {
  return piezas
    .filter((pieza) => sinFechaFirmada(pieza.estado))
    .sort(
      (a, b) =>
        (ORDEN_SIN_FECHA[a.estado] ?? 9) - (ORDEN_SIN_FECHA[b.estado] ?? 9) ||
        Date.parse(a.creadaEn) - Date.parse(b.creadaEn),
    )
}

/**
 * Every unsigned piece and its place: first the stored proposals that still hold (one piece per slot, in order), then
 * the next free rhythm slots for the rest, in the same order. No horizon: Repartir covers pieces beyond the Agenda.
 */
export function repartir(entrada: { piezas: readonly PiezaConFechas[]; horario: Horario; ahora: number }): Lugar[] {
  const { horario, ahora } = entrada
  const tomadas = new Set(fechasTomadas(entrada.piezas).map((iso) => Date.parse(iso)))
  const ordenadas = enOrden(entrada.piezas)
  const lugares = new Map<string, Lugar>()
  for (const pieza of ordenadas) {
    const vigente = propuestaVigente(pieza.fechaPropuesta, { ahora, tomadas, antelacionMs: ANTELACION_DE_AGENDA_MS })
    if (vigente === null) continue
    tomadas.add(Date.parse(vigente))
    lugares.set(pieza.id, { piezaId: pieza.id, instante: vigente, guardada: true })
  }
  const sinLugar = ordenadas.filter((pieza) => !lugares.has(pieza.id))
  const libres = proponerFechas({
    ahora,
    horario,
    ocupadas: [...tomadas].map((ms) => new Date(ms).toISOString()),
    cuantas: sinLugar.length,
    antelacionMs: ANTELACION_DE_AGENDA_MS,
  })
  sinLugar.forEach((pieza, i) => {
    const instante = libres[i]
    if (instante) lugares.set(pieza.id, { piezaId: pieza.id, instante, guardada: false })
  })
  return ordenadas.flatMap((pieza) => lugares.get(pieza.id) ?? [])
}

/**
 * The next `cuantas` slots nobody holds. `todos` counts every placed piece (what `Cambiar` offers); `guardados` only
 * stored proposals (what the server accepts), and `excepto` frees that piece's own place.
 */
export function huecosLibres(entrada: {
  piezas: readonly PiezaConFechas[]
  horario: Horario
  ahora: number
  cuantas: number
  contar: "todos" | "guardados"
  excepto?: string
}): string[] {
  const lugares = repartir(entrada).filter(
    (lugar) => lugar.piezaId !== entrada.excepto && (entrada.contar === "todos" || lugar.guardada),
  )
  return proponerFechas({
    ahora: entrada.ahora,
    horario: entrada.horario,
    ocupadas: [...fechasTomadas(entrada.piezas), ...lugares.map((lugar) => lugar.instante)],
    cuantas: entrada.cuantas,
    antelacionMs: ANTELACION_DE_AGENDA_MS,
  })
}

/** `Cambiar` on the server (amendment A8): a schedule slot no signed piece and no other stored proposal holds. */
export function espacioLibreParaCambiar(entrada: {
  piezas: readonly PiezaConFechas[]
  horario: Horario
  ahora: number
  piezaId: string
  instante: string
}): boolean {
  const pedido = Date.parse(entrada.instante)
  return huecosLibres({ ...entrada, cuantas: HUECOS_A_REVISAR, contar: "guardados", excepto: entrada.piezaId }).some(
    (iso) => Date.parse(iso) === pedido,
  )
}

/** Gate 2 preselects the first date (amendment A9): a live proposal goes first, the rest follow as today. */
export function conLaPropuestaPrimero(fechas: readonly string[], propuesta: string | null, cuantas: number): string[] {
  if (propuesta === null) return [...fechas]
  return [propuesta, ...fechas.filter((fecha) => fecha !== propuesta)].slice(0, cuantas)
}

export function textoPorRepartir(cuantas: number): string {
  return cuantas === 1 ? "1 pieza en camino sin fecha propuesta." : `${cuantas} piezas en camino sin fecha propuesta.`
}

export function textoDePropuestas(cuantas: number): string {
  if (cuantas === 0) return "Todas tus piezas ya tienen fecha propuesta."
  return cuantas === 1
    ? "Propuse fecha para 1 pieza. Puedes cambiarla."
    : `Propuse fecha para ${cuantas} piezas. Puedes cambiarlas.`
}
