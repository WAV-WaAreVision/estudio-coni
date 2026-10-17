import type { DatosDePilar } from "@/lib/dominio/pilares"
import type { DatosDelMotor, ParDelMotor, TemaDelMotor } from "@/lib/motor/datos"
import { claveDePar } from "@/lib/motor/datos"

export const PESO_SOPORTE = 0.3
export const PESO_EVIDENCIA = 0.2
export const PESO_PUENTE = 0.2
export const PESO_NOVEDAD = 0.2
export const PENALIZACION_DESCARTE = 0.1
export const MINIMO_AUTORES_CRUCE = 2
export const PUENTE_MIN = 0.6
export const PUENTE_MAX = 0.8
export const CRUCES_POR_SEMANA = 8
export const MAXIMO_CRUCES_POR_TEMA = 2
export const MINIMO_CRUCES_PARA_NO_ARRANQUE_EN_FRIO = 3

const AUTORES_PARA_SOPORTE_MAXIMO = 8
const AFIRMACIONES_PARA_SOPORTE_MAXIMO = 40
const HOLGURA_DEL_PUENTE = 0.15
const BONO_AUTORES_COMUNES = 0.2
const PENALIZACION_TEMA_RECIENTE = 0.25
const MAXIMO_UN_SOLO_AUTOR = 10
const AFIRMACIONES_MINIMAS_UN_SOLO_AUTOR = 3

export type ContextoDelPuntaje = Pick<DatosDelMotor, "recientes" | "descartes">

export interface ComponentesDelPuntaje {
  soporte: number
  evidencia: number
  puente: number
  novedad: number
  descarte: number
}

export interface CruceConPuntaje {
  par: ParDelMotor
  puntaje: number
  componentes: ComponentesDelPuntaje
}

const acotar = (x: number): number => Math.min(1, Math.max(0, x))

function soporteDe(autores: number, afirmaciones: number): number {
  return (
    Math.min(1, autores / AUTORES_PARA_SOPORTE_MAXIMO) * 0.5 +
    Math.min(1, afirmaciones / AFIRMACIONES_PARA_SOPORTE_MAXIMO) * 0.5
  )
}

function evidenciaDe(fuertes: number, afirmaciones: number): number {
  return afirmaciones > 0 ? acotar(fuertes / afirmaciones) : 0
}

function puenteDe(puente: number, autoresComunes: number): number {
  const fuera = puente < PUENTE_MIN ? PUENTE_MIN - puente : puente > PUENTE_MAX ? puente - PUENTE_MAX : 0
  const base = Math.max(0, 1 - fuera / HOLGURA_DEL_PUENTE)
  return Math.min(1, base + (autoresComunes > 0 ? BONO_AUTORES_COMUNES : 0))
}

export function puntuarPar(
  par: ParDelMotor,
  temaA: TemaDelMotor,
  temaB: TemaDelMotor,
  contexto: ContextoDelPuntaje,
): { puntaje: number; componentes: ComponentesDelPuntaje } {
  const soporte = soporteDe(temaA.autores + temaB.autores, temaA.afirmaciones + temaB.afirmaciones)
  const evidencia = evidenciaDe(
    temaA.evidencia_fuerte + temaB.evidencia_fuerte,
    temaA.afirmaciones + temaB.afirmaciones,
  )
  const puente = puenteDe(par.puente, par.autores_comunes)

  const recientes = contexto.recientes
  const novedad = recientes.pares.has(claveDePar(par.a, par.b))
    ? 0
    : acotar(
        1 -
          0.5 * Number(temaA.cubierto_por_coni) -
          0.5 * Number(temaB.cubierto_por_coni) -
          PENALIZACION_TEMA_RECIENTE * Number(recientes.temas.has(temaA.tema_id)) -
          PENALIZACION_TEMA_RECIENTE * Number(recientes.temas.has(temaB.tema_id)),
      )
  const descarte = Math.min(
    1,
    (contexto.descartes.get(temaA.tema_id) ?? 0) + (contexto.descartes.get(temaB.tema_id) ?? 0),
  )

  const puntaje =
    PESO_SOPORTE * soporte +
    PESO_EVIDENCIA * evidencia +
    PESO_PUENTE * puente +
    PESO_NOVEDAD * novedad -
    PENALIZACION_DESCARTE * descarte
  return { puntaje, componentes: { soporte, evidencia, puente, novedad, descarte } }
}

const porId = (x: string, y: string): number => (x < y ? -1 : x > y ? 1 : 0)

export function elegirCruces(
  pares: ParDelMotor[],
  temas: TemaDelMotor[],
  contexto: ContextoDelPuntaje,
): CruceConPuntaje[] {
  const porTema = new Map(temas.map((t) => [t.tema_id, t]))
  const puntuados: CruceConPuntaje[] = []
  for (const par of pares) {
    const a = porTema.get(par.a)
    const b = porTema.get(par.b)
    if (!a || !b) continue
    if (a.autores < MINIMO_AUTORES_CRUCE || b.autores < MINIMO_AUTORES_CRUCE) continue
    puntuados.push({ par, ...puntuarPar(par, a, b, contexto) })
  }
  puntuados.sort((x, y) => y.puntaje - x.puntaje || porId(x.par.a, y.par.a) || porId(x.par.b, y.par.b))

  const usosPorTema = new Map<string, number>()
  const elegidos: CruceConPuntaje[] = []
  for (const cruce of puntuados) {
    if (elegidos.length >= CRUCES_POR_SEMANA) break
    const { a, b } = cruce.par
    if ((usosPorTema.get(a) ?? 0) >= MAXIMO_CRUCES_POR_TEMA) continue
    if ((usosPorTema.get(b) ?? 0) >= MAXIMO_CRUCES_POR_TEMA) continue
    usosPorTema.set(a, (usosPorTema.get(a) ?? 0) + 1)
    usosPorTema.set(b, (usosPorTema.get(b) ?? 0) + 1)
    elegidos.push(cruce)
  }
  return elegidos
}

/** Cold start: a single topic scored with the same formulas as a crossing, one side only. */
export function puntuarTemaSolo(
  t: TemaDelMotor,
  contexto: ContextoDelPuntaje,
): { puntaje: number; componentes: Omit<ComponentesDelPuntaje, "puente"> } {
  const soporte = soporteDe(t.autores, t.afirmaciones)
  const evidencia = evidenciaDe(t.evidencia_fuerte, t.afirmaciones)
  const novedad = 1 - 0.5 * Number(t.cubierto_por_coni)
  const descarte = Math.min(1, contexto.descartes.get(t.tema_id) ?? 0)
  const puntaje =
    PESO_SOPORTE * soporte + PESO_EVIDENCIA * evidencia + PESO_NOVEDAD * novedad - PENALIZACION_DESCARTE * descarte
  return { puntaje, componentes: { soporte, evidencia, novedad, descarte } }
}

/** Cold start: single topics ranked by `puntuarTemaSolo`. */
export function elegirTemasSolos(temas: TemaDelMotor[], contexto: ContextoDelPuntaje, n: number): TemaDelMotor[] {
  return temas
    .filter((t) => !contexto.recientes.temas.has(t.tema_id))
    .map((t) => ({ t, p: puntuarTemaSolo(t, contexto).puntaje }))
    .sort((x, y) => y.p - x.p || porId(x.t.tema_id, y.t.tema_id))
    .slice(0, n)
    .map(({ t }) => t)
}

export function reporteQueSubir(
  temas: TemaDelMotor[],
  activos: readonly Pick<DatosDePilar, "slug">[],
): { unSoloAutor: string[]; pilaresSinMaterial: string[] } {
  const unSoloAutor = temas
    .filter((t) => t.autores === 1 && t.afirmaciones >= AFIRMACIONES_MINIMAS_UN_SOLO_AUTOR)
    .sort((x, y) => y.afirmaciones - x.afirmaciones || porId(x.tema_id, y.tema_id))
    .slice(0, MAXIMO_UN_SOLO_AUTOR)
    .map((t) => t.nombre)
  const conMaterial = new Set(temas.map((t) => t.pilar))
  // Slugs, not names: the ingesta's Semana names them from `categorias` and drops retired ones (amendment 13).
  return { unSoloAutor, pilaresSinMaterial: activos.filter((p) => !conMaterial.has(p.slug)).map((p) => p.slug) }
}
