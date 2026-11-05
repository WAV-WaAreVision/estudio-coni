import { type CatalogoDePilares, soloActivos } from "./pilares"

/** Coni's rule (part 1, section 6): at least 1 of every 3 pieces, read over the pillar's last 6. */
export const VENTANA_DE_PIEZAS = 6
/** "Si pasan varias semanas sin piezas de ese ángulo": three. */
export const DIAS_SIN_EL_ANGULO = 21
const DIA_MS = 86_400_000
// `minimo` arrives as a float (1/3 reads 0.333…): 6 times it may land a hair under 2, never meant as 3.
const HOLGURA = 1e-9

/** A published piece with an angle (`piezas_con_angulo`). */
export interface PiezaConAngulo {
  pilarId: string
  anguloId: string
  publicadaEn: string
}

export interface FaltaDeAngulo {
  /** `proporcion`: fewer than the minimum among the last 6; `tiempo`: three weeks without the angle. */
  tipo: "proporcion" | "tiempo"
  pilarId: string
  /** The pillar's short name, as Coni calls it. */
  pilar: string
  anguloId: string
  angulo: string
  /** Pieces of the angle among the pillar's last 6. */
  delAngulo: number
  /** How many of 6 the rule asks for. */
  minimo: number
}

export function minimoDePiezas(minimo: number): number {
  return Math.ceil(VENTANA_DE_PIEZAS * minimo - HOLGURA)
}

const instante = (pieza: PiezaConAngulo) => Date.parse(pieza.publicadaEn)

/**
 * The angles with a minimum that fall short now (spec 15d, section 4). Share: with 6 pieces at least, fewer than the
 * minimum among the last 6. Time: 21 days since the angle's last piece (or, never published, since the pillar's
 * first), while the pillar published after it. One per angle, the share first. It only warns: nothing reads it to
 * block.
 */
export function faltasDeAngulo(
  catalogo: CatalogoDePilares,
  piezas: readonly PiezaConAngulo[],
  ahora: number,
): FaltaDeAngulo[] {
  return soloActivos(catalogo).flatMap((pilar) => {
    const delPilar = piezas.filter((pieza) => pieza.pilarId === pilar.id).toSorted((a, b) => instante(b) - instante(a))
    return pilar.angulos.flatMap((angulo): FaltaDeAngulo[] => {
      if (angulo.minimo === null || delPilar.length === 0) return []
      const minimo = minimoDePiezas(angulo.minimo)
      const ultimas = delPilar.slice(0, VENTANA_DE_PIEZAS)
      const delAngulo = ultimas.filter((pieza) => pieza.anguloId === angulo.id).length
      const base = {
        pilarId: pilar.id,
        pilar: pilar.nombreCorto,
        anguloId: angulo.id,
        angulo: angulo.nombre,
        delAngulo,
        minimo,
      }
      if (ultimas.length === VENTANA_DE_PIEZAS && delAngulo < minimo) return [{ tipo: "proporcion", ...base }]
      const ultimaDelAngulo = delPilar.find((pieza) => pieza.anguloId === angulo.id)
      const referencia = ultimaDelAngulo ?? delPilar.at(-1)
      if (!referencia) return []
      const desde = instante(referencia)
      const publicoDespues = ultimaDelAngulo === undefined || delPilar.some((pieza) => instante(pieza) > desde)
      if (ahora - desde >= DIAS_SIN_EL_ANGULO * DIA_MS && publicoDespues) return [{ tipo: "tiempo", ...base }]
      return []
    })
  })
}

/** What the notice says, in her words. */
export function mensajeDeFalta(falta: FaltaDeAngulo): string {
  if (falta.tipo === "tiempo") {
    return `Llevas ${DIAS_SIN_EL_ANGULO / 7} semanas sin publicar piezas de «${falta.angulo}» en «${falta.pilar}».`
  }
  const cuantas =
    falta.delAngulo === 0
      ? `ninguna de tus últimas ${VENTANA_DE_PIEZAS} piezas es`
      : falta.delAngulo === 1
        ? `solo 1 de tus últimas ${VENTANA_DE_PIEZAS} piezas es`
        : `solo ${falta.delAngulo} de tus últimas ${VENTANA_DE_PIEZAS} piezas son`
  return `En «${falta.pilar}», ${cuantas} de «${falta.angulo}». Tu regla es al menos ${falta.minimo} de cada ${VENTANA_DE_PIEZAS}.`
}

/** One notice per angle and week (`avisos.clave` is unique): `lunes` is the Monday of the week, YYYY-MM-DD. */
export function claveDeFalta(anguloId: string, lunes: string): string {
  return `equilibrio_de_angulo:${anguloId}:${lunes}`
}

/** The names of the angles that fall short, by pillar id, for the Temas row. */
export function faltasPorPilar(faltas: readonly FaltaDeAngulo[]): Record<string, string[]> {
  const porPilar: Record<string, string[]> = {}
  for (const falta of faltas) porPilar[falta.pilarId] = [...(porPilar[falta.pilarId] ?? []), falta.angulo]
  return porPilar
}

/** The second line of a pillar's chip in Temas. */
export function lineaDeFalta(angulos: readonly string[]): string {
  return `Falta ${angulos.join(" y ")}`
}
