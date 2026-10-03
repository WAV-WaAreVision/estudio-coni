import { describe, expect, it } from "vitest"
import type { ParDelMotor, TemaDelMotor } from "@/lib/motor/datos"
import { claveDePar } from "@/lib/motor/datos"
import {
  type ContextoDelPuntaje,
  CRUCES_POR_SEMANA,
  elegirCruces,
  elegirTemasSolos,
  puntuarPar,
  reporteQueSubir,
} from "@/lib/motor/puntaje"

const tema = (id: string, extra: Partial<TemaDelMotor> = {}): TemaDelMotor => ({
  tema_id: id,
  nombre: `Tema ${id}`,
  pilar: "pareja",
  afirmaciones: 20,
  autores: 4,
  evidencia_fuerte: 10,
  cubierto_por_coni: false,
  ...extra,
})
const par = (a: string, b: string, extra: Partial<ParDelMotor> = {}): ParDelMotor => ({
  a,
  b,
  puente: 0.7,
  autores_comunes: 0,
  ...extra,
})
const vacio = (): ContextoDelPuntaje => ({
  recientes: { temas: new Set(), pares: new Set() },
  descartes: new Map(),
})

describe("puntuarPar", () => {
  it("computes soporte from authors and claims, each capped at 1", () => {
    const { componentes } = puntuarPar(
      par("a", "b"),
      tema("a", { autores: 2, afirmaciones: 10 }),
      tema("b", { autores: 2, afirmaciones: 10 }),
      vacio(),
    )
    expect(componentes.soporte).toBeCloseTo(0.5 * 0.5 + 0.5 * 0.5)
    const alto = puntuarPar(par("a", "b"), tema("a", { autores: 9, afirmaciones: 50 }), tema("b"), vacio())
    expect(alto.componentes.soporte).toBe(1)
  })

  it("computes evidencia as strong claims over all claims, 0 without claims", () => {
    const r = puntuarPar(
      par("a", "b"),
      tema("a", { afirmaciones: 10, evidencia_fuerte: 5 }),
      tema("b", { afirmaciones: 10, evidencia_fuerte: 1 }),
      vacio(),
    )
    expect(r.componentes.evidencia).toBeCloseTo(0.3)
    const sin = puntuarPar(
      par("a", "b"),
      tema("a", { afirmaciones: 0, evidencia_fuerte: 0 }),
      tema("b", { afirmaciones: 0, evidencia_fuerte: 0 }),
      vacio(),
    )
    expect(sin.componentes.evidencia).toBe(0)
  })

  it("gives puente 1 inside the band and falls linearly to 0 at 0.15 outside", () => {
    const p = (puente: number, autores_comunes = 0) =>
      puntuarPar(par("a", "b", { puente, autores_comunes }), tema("a"), tema("b"), vacio()).componentes.puente
    expect(p(0.6)).toBe(1)
    expect(p(0.8)).toBe(1)
    expect(p(0.525)).toBeCloseTo(0.5)
    expect(p(0.875)).toBeCloseTo(0.5)
    expect(p(0.45)).toBeCloseTo(0)
    expect(p(0.2)).toBe(0)
    expect(p(0.525, 1)).toBeCloseTo(0.7)
    expect(p(0.7, 3)).toBe(1)
  })

  it("lowers novedad for covered topics, recent topics and zeroes it for recent pairs", () => {
    const n = (a: Partial<TemaDelMotor>, b: Partial<TemaDelMotor>, ctx = vacio()) =>
      puntuarPar(par("a", "b"), tema("a", a), tema("b", b), ctx).componentes.novedad
    expect(n({}, {})).toBe(1)
    expect(n({ cubierto_por_coni: true }, {})).toBeCloseTo(0.5)
    expect(n({ cubierto_por_coni: true }, { cubierto_por_coni: true })).toBe(0)
    const tema1 = { ...vacio(), recientes: { temas: new Set(["a"]), pares: new Set<string>() } }
    expect(n({}, {}, tema1)).toBeCloseTo(0.75)
    const ambos = { ...vacio(), recientes: { temas: new Set(["a", "b"]), pares: new Set<string>() } }
    expect(n({}, {}, ambos)).toBeCloseTo(0.5)
    const usado = { ...vacio(), recientes: { temas: new Set<string>(), pares: new Set([claveDePar("a", "b")]) } }
    expect(n({}, {}, usado)).toBe(0)
  })

  it("floors novedad at 0", () => {
    const ctx = { ...vacio(), recientes: { temas: new Set(["a", "b"]), pares: new Set<string>() } }
    const r = puntuarPar(
      par("a", "b"),
      tema("a", { cubierto_por_coni: true }),
      tema("b", { cubierto_por_coni: true }),
      ctx,
    )
    expect(r.componentes.novedad).toBe(0)
  })

  it("computes descarte as the capped sum of discards of both topics", () => {
    const ctx = { ...vacio(), descartes: new Map([["a", 1]]) }
    expect(puntuarPar(par("a", "b"), tema("a"), tema("b"), ctx).componentes.descarte).toBe(1)
    const dos = {
      ...vacio(),
      descartes: new Map([
        ["a", 3],
        ["b", 2],
      ]),
    }
    expect(puntuarPar(par("a", "b"), tema("a"), tema("b"), dos).componentes.descarte).toBe(1)
    expect(puntuarPar(par("a", "b"), tema("a"), tema("b"), vacio()).componentes.descarte).toBe(0)
  })

  it("combines components with the weights and subtracts the discard penalty", () => {
    const ctx = { ...vacio(), descartes: new Map([["a", 1]]) }
    const { puntaje, componentes: c } = puntuarPar(par("a", "b"), tema("a"), tema("b"), ctx)
    const esperado = 0.3 * c.soporte + 0.2 * c.evidencia + 0.2 * c.puente + 0.2 * c.novedad - 0.1 * c.descarte
    expect(puntaje).toBeCloseTo(esperado)
  })
})

describe("elegirCruces", () => {
  it("drops pairs where either topic has fewer than 2 authors", () => {
    const temas = [tema("a"), tema("b"), tema("c", { autores: 1 })]
    const r = elegirCruces([par("a", "b"), par("a", "c")], temas, vacio())
    expect(r.map((x) => `${x.par.a}|${x.par.b}`)).toEqual(["a|b"])
  })

  it("drops pairs that reference unknown topics", () => {
    expect(elegirCruces([par("a", "zzz")], [tema("a")], vacio())).toEqual([])
  })

  it("sorts by score desc then by ids", () => {
    const temas = [tema("a"), tema("b"), tema("c"), tema("d")]
    const pares = [par("c", "d"), par("a", "b"), par("a", "c", { puente: 0.3 })]
    const r = elegirCruces(pares, temas, vacio())
    expect(r.map((x) => `${x.par.a}|${x.par.b}`)).toEqual(["a|b", "c|d", "a|c"])
  })

  it("keeps at most CRUCES_POR_SEMANA crossings", () => {
    const ids = Array.from({ length: 40 }, (_, i) => `t${String(i).padStart(2, "0")}`)
    const temas = ids.map((id) => tema(id))
    const pares = ids.flatMap((x, i) => (i % 2 === 0 ? [par(x, ids[i + 1] as string)] : []))
    expect(pares.length).toBe(20)
    expect(elegirCruces(pares, temas, vacio())).toHaveLength(CRUCES_POR_SEMANA)
  })

  it("keeps each topic in at most 2 crossings", () => {
    const temas = ["a", "b", "c", "d", "e"].map((id) => tema(id))
    const pares = [par("a", "b"), par("a", "c"), par("a", "d"), par("a", "e")]
    const r = elegirCruces(pares, temas, vacio())
    expect(r.map((x) => x.par.b)).toEqual(["b", "c"])
  })

  it("exposes the score and components of each chosen crossing", () => {
    const r = elegirCruces([par("a", "b")], [tema("a"), tema("b")], vacio())
    expect(r[0]?.puntaje).toBeGreaterThan(0)
    expect(r[0]?.componentes.puente).toBe(1)
  })
})

describe("elegirTemasSolos", () => {
  it("excludes topics used in the window and ranks by soporte, evidencia and novedad", () => {
    const temas = [
      tema("a", { autores: 1, afirmaciones: 4, evidencia_fuerte: 0 }),
      tema("b"),
      tema("c", { cubierto_por_coni: true }),
      tema("d"),
    ]
    const ctx = { ...vacio(), recientes: { temas: new Set(["d"]), pares: new Set<string>() } }
    expect(elegirTemasSolos(temas, ctx, 10).map((t) => t.tema_id)).toEqual(["b", "c", "a"])
  })

  it("returns at most n topics, ties broken by id", () => {
    const temas = [tema("z"), tema("m"), tema("a")]
    expect(elegirTemasSolos(temas, vacio(), 2).map((t) => t.tema_id)).toEqual(["a", "m"])
  })
})

describe("reporteQueSubir", () => {
  it("lists single-author topics with at least 3 claims, top 10 by claims", () => {
    const solos = Array.from({ length: 12 }, (_, i) =>
      tema(`s${i}`, { nombre: `Solo ${i}`, autores: 1, afirmaciones: 3 + i }),
    )
    const temas = [
      ...solos,
      tema("poco", { autores: 1, afirmaciones: 2 }),
      tema("dos", { autores: 2, afirmaciones: 99 }),
    ]
    const { unSoloAutor } = reporteQueSubir(temas)
    expect(unSoloAutor).toHaveLength(10)
    expect(unSoloAutor[0]).toBe("Solo 11")
    expect(unSoloAutor).not.toContain("Tema poco")
    expect(unSoloAutor).not.toContain("Tema dos")
  })

  it("lists pillars with no topic", () => {
    const temas = [
      tema("a", { pilar: "pareja" }),
      tema("b", { pilar: "deseo" }),
      tema("c", { pilar: null }),
      tema("d", { pilar: "general" }),
    ]
    expect(reporteQueSubir(temas).pilaresSinMaterial).toEqual(["autoestima", "limites", "bienestar"])
  })
})
