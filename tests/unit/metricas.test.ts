import { describe, expect, it } from "vitest"
import {
  agruparPorSemana,
  compararTemas,
  contarEnMes,
  guardadosPorMil,
  limitesDelMes,
  lunesDeLaSemana,
  metricasAlDia,
  type ReelMedido,
  segundosVistos,
  sumarDias,
  UMBRAL_DE_REELS,
} from "@/lib/dominio/metricas"
import type { Pilar } from "@/lib/dominio/pilares"

const ZONA = "America/Santiago"

function reel(extra: Partial<ReelMedido> & { id: string }): ReelMedido {
  return {
    piezaId: extra.id,
    titulo: `Reel ${extra.id}`,
    pilar: "pareja",
    publicadoEn: "2026-10-08T22:00:00.000Z",
    dia: "2026-10-09",
    alcance: 1000,
    guardados: 10,
    compartidos: 2,
    comentarios: 1,
    tiempoPromedio: 12_000,
    ...extra,
  }
}

function reels(pilar: Pilar, porMil: readonly number[]): ReelMedido[] {
  return porMil.map((valor, i) => reel({ id: `${pilar}-${i}`, pilar, alcance: 1000, guardados: valor }))
}

describe("guardadosPorMil", () => {
  it("scales saves to every 1,000 people reached, with one decimal", () => {
    expect(guardadosPorMil(121, 2400)).toBe(50.4)
    expect(guardadosPorMil(4, 1000)).toBe(4)
  })

  it("is unknown when the reach is zero or either number is missing", () => {
    expect(guardadosPorMil(5, 0)).toBeNull()
    expect(guardadosPorMil(null, 1000)).toBeNull()
    expect(guardadosPorMil(5, null)).toBeNull()
  })
})

describe("segundosVistos", () => {
  it("reads Instagram's raw average watch time as milliseconds", () => {
    expect(segundosVistos(24_400)).toBe(24)
    expect(segundosVistos(null)).toBeNull()
  })

  it("hides a figure that would read as under a second: if Instagram's unit were seconds, it would be a wrong number", () => {
    expect(segundosVistos(24.4)).toBeNull()
    expect(segundosVistos(0)).toBeNull()
    expect(segundosVistos(499)).toBeNull()
  })
})

describe("semanas", () => {
  it("starts a week on Monday in Chile, not in UTC", () => {
    // Sunday 11 Oct 2026 at 22:00 in Santiago is already Monday 12 Oct in UTC.
    expect(lunesDeLaSemana(Date.parse("2026-10-12T01:30:00.000Z"), ZONA)).toBe("2026-10-05")
    expect(lunesDeLaSemana(Date.parse("2026-10-12T04:30:00.000Z"), ZONA)).toBe("2026-10-12")
    expect(lunesDeLaSemana(Date.parse("2026-10-08T22:00:00.000Z"), ZONA)).toBe("2026-10-05")
  })

  it("adds days to a calendar day across a month end", () => {
    expect(sumarDias("2026-10-30", 3)).toBe("2026-11-02")
    expect(sumarDias("2026-10-05", -7)).toBe("2026-09-28")
  })

  it("groups reels, consultations and link clicks by week, newest first", () => {
    const semanas = agruparPorSemana({
      reels: [
        reel({ id: "a", publicadoEn: "2026-10-06T22:00:00.000Z" }),
        reel({ id: "b", publicadoEn: "2026-10-08T22:00:00.000Z" }),
        reel({ id: "c", publicadoEn: "2026-10-15T22:00:00.000Z" }),
      ],
      consultas: ["2026-10-07T15:00:00.000Z", "2026-10-20T15:00:00.000Z"],
      clics: [
        { dia: "2026-10-06", clics: 3 },
        { dia: "2026-10-09", clics: 5 },
      ],
      zona: ZONA,
    })

    expect(semanas.map((s) => s.lunes)).toEqual(["2026-10-19", "2026-10-12", "2026-10-05"])
    const primera = semanas.at(2)
    expect(primera?.reels.map((r) => r.piezaId)).toEqual(["a", "b"])
    expect(primera?.consultas).toBe(1)
    expect(primera?.clics).toBe(8)
    expect(semanas.at(0)?.reels).toEqual([])
    expect(semanas.at(0)?.consultas).toBe(1)
  })
})

describe("contarEnMes", () => {
  it("counts the consultations of a month as Chile lives it", () => {
    const consultas = [
      "2026-10-01T02:00:00.000Z", // 30 Sep 23:00 in Santiago
      "2026-10-01T04:00:00.000Z", // 1 Oct 01:00
      "2026-10-31T20:00:00.000Z",
      "2026-11-01T02:59:00.000Z", // 31 Oct 23:59
      "2026-11-01T03:30:00.000Z", // 1 Nov 00:30
    ]
    expect(contarEnMes(consultas, "2026-10", ZONA)).toBe(3)
  })
})

describe("limitesDelMes", () => {
  it("gives the month Coni is living, in words, with its exact edges in her zone", () => {
    const mes = limitesDelMes(Date.parse("2026-10-15T15:00:00.000Z"), ZONA)
    expect(mes.clave).toBe("2026-10")
    expect(mes.nombre).toBe("octubre")
    expect(new Date(mes.desde).toISOString()).toBe("2026-10-01T03:00:00.000Z")
    expect(new Date(mes.hasta).toISOString()).toBe("2026-11-01T03:00:00.000Z")
  })

  it("is still the previous month in Chile when UTC has already turned over", () => {
    const mes = limitesDelMes(Date.parse("2026-11-01T02:30:00.000Z"), ZONA)
    expect(mes.clave).toBe("2026-10")
  })

  it("crosses a year end", () => {
    const mes = limitesDelMes(Date.parse("2026-12-20T15:00:00.000Z"), ZONA)
    expect(mes.nombre).toBe("diciembre")
    expect(new Date(mes.hasta).toISOString()).toBe("2027-01-01T03:00:00.000Z")
  })
})

describe("metricasAlDia", () => {
  it("accepts yesterday's snapshot before the morning run, and wants today's after it", () => {
    const seisAm = Date.parse("2026-10-10T09:00:00.000Z") // 06:00 in Santiago (summer time, UTC-3, since early September)
    const mediodia = Date.parse("2026-10-10T15:00:00.000Z") // 12:00
    expect(metricasAlDia({ ultimoDia: "2026-10-09", ahora: seisAm, zona: ZONA })).toBe(true)
    expect(metricasAlDia({ ultimoDia: "2026-10-09", ahora: mediodia, zona: ZONA })).toBe(false)
    expect(metricasAlDia({ ultimoDia: "2026-10-10", ahora: mediodia, zona: ZONA })).toBe(true)
  })

  it("has nothing to be late for when no snapshot exists yet", () => {
    expect(metricasAlDia({ ultimoDia: null, ahora: Date.now(), zona: ZONA })).toBe(true)
  })
})

describe("compararTemas", () => {
  it("says nothing without measured reels", () => {
    expect(compararTemas([])).toEqual({ estado: "sin_reels" })
  })

  it("never compares while no two themes reach the threshold, and shows the sample sizes", () => {
    const resultado = compararTemas([...reels("autoestima", [5, 6, 7]), ...reels("pareja", [9])])
    expect(resultado).toEqual({
      estado: "temprano",
      umbral: UMBRAL_DE_REELS,
      temas: [
        { pilar: "autoestima", n: 3 },
        { pilar: "pareja", n: 1 },
      ],
    })
  })

  it("does not compare when only one theme has reached the threshold", () => {
    const resultado = compararTemas([...reels("autoestima", [1, 2, 3, 4, 5, 6, 7, 8]), ...reels("pareja", [9, 9])])
    expect(resultado.estado).toBe("temprano")
  })

  it("ignores reels without reach and reels without a theme", () => {
    const resultado = compararTemas([
      reel({ id: "x", pilar: null }),
      reel({ id: "y", pilar: "pareja", alcance: 0 }),
      reel({ id: "z", pilar: "pareja", alcance: null }),
    ])
    expect(resultado).toEqual({ estado: "sin_reels" })
  })

  it("compares the two themes with the most reels once both have eight, with the mean, the interval and n", () => {
    const resultado = compararTemas([
      ...reels("autoestima", [20, 22, 21, 19, 23, 20, 22, 21]),
      ...reels("pareja", [10, 12, 11, 9, 13, 10, 12, 11]),
      ...reels("deseo", [30]),
    ])
    if (resultado.estado !== "comparable") throw new Error(`Se esperaba comparable y fue ${resultado.estado}`)
    expect(resultado.temas.map((t) => [t.pilar, t.n, t.media])).toEqual([
      ["autoestima", 8, 21],
      ["pareja", 8, 11],
    ])
    expect(resultado.pendientes).toEqual([{ pilar: "deseo", n: 1 }])
    expect(resultado.diferencia.mayor).toBe("autoestima")
    expect(resultado.diferencia.valor).toBe(10)
    // Welch interval for the difference of two means; both sides above zero means the gap is not noise.
    expect(resultado.diferencia.desde).toBeGreaterThan(8)
    expect(resultado.diferencia.hasta).toBeLessThan(12)
    expect(resultado.diferencia.distinguible).toBe(true)
  })

  it("never shows a theme's interval below zero: saves cannot be negative", () => {
    const resultado = compararTemas([
      ...reels("autoestima", [0, 0, 0, 0, 0, 0, 0, 40]),
      ...reels("pareja", [1, 1, 1, 1, 1, 1, 1, 1]),
    ])
    if (resultado.estado !== "comparable") throw new Error("Se esperaba comparable")
    const autoestima = resultado.temas.find((t) => t.pilar === "autoestima")
    expect(autoestima?.desde).toBe(0)
  })

  it("calls a gap indistinguishable when its interval includes zero", () => {
    const resultado = compararTemas([
      ...reels("autoestima", [5, 25, 10, 20, 8, 22, 12, 18]),
      ...reels("pareja", [6, 24, 11, 19, 9, 21, 13, 17]),
    ])
    if (resultado.estado !== "comparable") throw new Error("Se esperaba comparable")
    expect(resultado.diferencia.distinguible).toBe(false)
    expect(resultado.diferencia.desde).toBeLessThan(0)
    expect(resultado.diferencia.hasta).toBeGreaterThan(0)
  })
})
