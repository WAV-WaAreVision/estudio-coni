import { describe, expect, it } from "vitest"
import {
  claveDeFalta,
  faltasDeAngulo,
  faltasPorPilar,
  lineaDeFalta,
  mensajeDeFalta,
  minimoDePiezas,
  type PiezaConAngulo,
} from "@/lib/dominio/angulos"
import { ANGULO_DE_PRUEBA, PILARES_DE_PRUEBA } from "../fixtures/pilares"

const PSICOLOGIA = "00000000-0000-4000-8000-000000000103"
const PARTIDA = "00000000-0000-4000-8000-000000000202"
const DIA = 86_400_000
const AHORA = Date.parse("2026-11-09T11:30:00.000Z")
const haceDias = (dias: number) => new Date(AHORA - dias * DIA).toISOString()

const pieza = (pilarId: string, anguloId: string, dias: number): PiezaConAngulo => ({
  pilarId,
  anguloId,
  publicadaEn: haceDias(dias),
})
const planteo = (dias: number) => pieza(PSICOLOGIA, ANGULO_DE_PRUEBA.loQuePlanteo, dias)
const construyo = (dias: number) => pieza(PSICOLOGIA, ANGULO_DE_PRUEBA.loQueConstruyo, dias)

describe("minimoDePiezas", () => {
  it("is 2 of 6 for 1/3, even when the float is a hair under", () => {
    expect(minimoDePiezas(1 / 3)).toBe(2)
    expect(minimoDePiezas(0.3333333333333333)).toBe(2)
    expect(minimoDePiezas(0.5)).toBe(3)
  })
})

describe("faltasDeAngulo", () => {
  it("says nothing without pieces with an angle", () => {
    expect(faltasDeAngulo(PILARES_DE_PRUEBA, [], AHORA)).toEqual([])
  })

  it("waits for six pieces before the share counts", () => {
    expect(faltasDeAngulo(PILARES_DE_PRUEBA, [1, 2, 3, 4, 5].map(planteo), AHORA)).toEqual([])
  })

  it("is short when fewer than 2 of the last 6 are of the angle, and fine with exactly 2", () => {
    const seis = [1, 2, 3, 4, 5, 6].map(planteo)
    expect(faltasDeAngulo(PILARES_DE_PRUEBA, seis, AHORA)).toEqual([
      {
        tipo: "proporcion",
        pilarId: PSICOLOGIA,
        pilar: "Psicología en la mesa",
        anguloId: ANGULO_DE_PRUEBA.loQueConstruyo,
        angulo: "Lo que construyo",
        delAngulo: 0,
        minimo: 2,
      },
    ])
    const uno = [construyo(1), ...[2, 3, 4, 5, 6].map(planteo)]
    expect(faltasDeAngulo(PILARES_DE_PRUEBA, uno, AHORA)[0]).toMatchObject({ tipo: "proporcion", delAngulo: 1 })
    const dos = [construyo(1), construyo(4), ...[2, 3, 5, 6].map(planteo)]
    expect(faltasDeAngulo(PILARES_DE_PRUEBA, dos, AHORA)).toEqual([])
  })

  it("looks only at the last six: an older piece of the angle does not help", () => {
    const piezas = [...[1, 2, 3, 4, 5, 6].map(planteo), construyo(7), construyo(8)]
    expect(faltasDeAngulo(PILARES_DE_PRUEBA, piezas, AHORA)[0]).toMatchObject({ tipo: "proporcion", delAngulo: 0 })
  })

  it("is short after 21 days without the angle while the pillar published after it", () => {
    expect(faltasDeAngulo(PILARES_DE_PRUEBA, [construyo(21), planteo(3)], AHORA)[0]).toMatchObject({ tipo: "tiempo" })
    expect(faltasDeAngulo(PILARES_DE_PRUEBA, [construyo(20), planteo(3)], AHORA)).toEqual([])
    // Nothing of the pillar after the angle's last piece: the pillar is quiet, not the angle.
    expect(faltasDeAngulo(PILARES_DE_PRUEBA, [construyo(30)], AHORA)).toEqual([])
  })

  it("counts from the pillar's first piece when the angle never had one", () => {
    expect(faltasDeAngulo(PILARES_DE_PRUEBA, [planteo(21)], AHORA)[0]).toMatchObject({ tipo: "tiempo" })
    expect(faltasDeAngulo(PILARES_DE_PRUEBA, [planteo(20), planteo(2)], AHORA)).toEqual([])
  })

  it("says one shortfall per angle, the share first, and none for an angle without a minimum", () => {
    const viejas = [21, 22, 23, 24, 25, 26].map(planteo)
    const faltas = faltasDeAngulo(PILARES_DE_PRUEBA, viejas, AHORA)
    expect(faltas.map((falta) => [falta.angulo, falta.tipo])).toEqual([["Lo que construyo", "proporcion"]])
  })

  it("checks each pillar on its own pieces", () => {
    const piezas = [...[1, 2, 3, 4, 5, 6].map(planteo), pieza(PARTIDA, ANGULO_DE_PRUEBA.prueba, 1)]
    expect(faltasDeAngulo(PILARES_DE_PRUEBA, piezas, AHORA).map((falta) => falta.angulo)).toEqual(["Lo que construyo"])
  })
})

describe("the words of a shortfall", () => {
  const base = {
    pilarId: PSICOLOGIA,
    pilar: "Psicología en la mesa",
    anguloId: ANGULO_DE_PRUEBA.loQueConstruyo,
    angulo: "Lo que construyo",
    minimo: 2,
  }

  it("says the share in her words", () => {
    expect(mensajeDeFalta({ ...base, tipo: "proporcion", delAngulo: 0 })).toBe(
      "En «Psicología en la mesa», ninguna de tus últimas 6 piezas es de «Lo que construyo». Tu regla es al menos 2 de cada 6.",
    )
    expect(mensajeDeFalta({ ...base, tipo: "proporcion", delAngulo: 1 })).toBe(
      "En «Psicología en la mesa», solo 1 de tus últimas 6 piezas es de «Lo que construyo». Tu regla es al menos 2 de cada 6.",
    )
    expect(mensajeDeFalta({ ...base, tipo: "proporcion", delAngulo: 2, minimo: 3 })).toBe(
      "En «Psicología en la mesa», solo 2 de tus últimas 6 piezas son de «Lo que construyo». Tu regla es al menos 3 de cada 6.",
    )
  })

  it("says the weeks without the angle", () => {
    expect(mensajeDeFalta({ ...base, tipo: "tiempo", delAngulo: 0 })).toBe(
      "Llevas 3 semanas sin publicar piezas de «Lo que construyo» en «Psicología en la mesa».",
    )
  })

  it("keys the notice by angle and week", () => {
    expect(claveDeFalta(ANGULO_DE_PRUEBA.prueba, "2026-11-09")).toBe(
      `equilibrio_de_angulo:${ANGULO_DE_PRUEBA.prueba}:2026-11-09`,
    )
  })

  it("groups the angles that fall short by pillar, for the Temas row", () => {
    const faltas = [
      { ...base, tipo: "proporcion" as const, delAngulo: 0 },
      { ...base, tipo: "tiempo" as const, delAngulo: 0, anguloId: "x", angulo: "Otro" },
    ]
    expect(faltasPorPilar(faltas)).toEqual({ [PSICOLOGIA]: ["Lo que construyo", "Otro"] })
    expect(lineaDeFalta(["Lo que construyo"])).toBe("Falta Lo que construyo")
    expect(lineaDeFalta(["Lo que construyo", "Otro"])).toBe("Falta Lo que construyo y Otro")
  })
})
