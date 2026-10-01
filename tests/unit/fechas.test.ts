import { describe, expect, it } from "vitest"
import { etiquetaDeFecha, instanteLocal, proponerFechas, semanaDe } from "@/lib/dominio/fechas"

const ZONA = "America/Santiago"
const HORARIO = { dias: [2, 4, 6], hora: "19:00", zona: ZONA }
const HORA = 60 * 60 * 1000

describe("instanteLocal", () => {
  it("reads 19:00 in Chile summer time (UTC-3) as 22:00 UTC", () => {
    expect(new Date(instanteLocal({ anio: 2026, mes: 10, dia: 8, hora: 19, minuto: 0 }, ZONA)).toISOString()).toBe(
      "2026-10-08T22:00:00.000Z",
    )
  })

  it("reads 19:00 in Chile winter time (UTC-4) as 23:00 UTC", () => {
    expect(new Date(instanteLocal({ anio: 2026, mes: 7, dia: 2, hora: 19, minuto: 0 }, ZONA)).toISOString()).toBe(
      "2026-07-02T23:00:00.000Z",
    )
  })
})

describe("proponerFechas", () => {
  it("proposes the next Tuesday, Thursday and Saturday at 19:00 Chile time", () => {
    // Wednesday 7 October 2026, 12:00 in Santiago.
    const ahora = Date.parse("2026-10-07T15:00:00Z")

    const fechas = proponerFechas({ ahora, horario: HORARIO, ocupadas: [], cuantas: 3 })

    expect(fechas).toEqual(["2026-10-08T22:00:00.000Z", "2026-10-10T22:00:00.000Z", "2026-10-13T22:00:00.000Z"])
  })

  it("skips the slots that already have a piece scheduled", () => {
    const ahora = Date.parse("2026-10-07T15:00:00Z")

    const fechas = proponerFechas({ ahora, horario: HORARIO, ocupadas: ["2026-10-08T22:00:00.000Z"], cuantas: 2 })

    expect(fechas).toEqual(["2026-10-10T22:00:00.000Z", "2026-10-13T22:00:00.000Z"])
  })

  it("needs the lead time: a slot too close is skipped", () => {
    // Thursday 8 October, 17:00 in Santiago: 19:00 is two hours away.
    const ahora = Date.parse("2026-10-08T20:00:00Z")

    expect(proponerFechas({ ahora, horario: HORARIO, ocupadas: [], cuantas: 1, antelacionMs: 2 * HORA })).toEqual([
      "2026-10-08T22:00:00.000Z",
    ])
    expect(proponerFechas({ ahora, horario: HORARIO, ocupadas: [], cuantas: 1, antelacionMs: 3 * HORA })).toEqual([
      "2026-10-10T22:00:00.000Z",
    ])
  })

  it("counts the day in Chile, not in UTC", () => {
    // 02:00 UTC on Thursday 8 is still Wednesday 7 at 23:00 in Santiago.
    const ahora = Date.parse("2026-10-08T02:00:00Z")

    expect(proponerFechas({ ahora, horario: HORARIO, ocupadas: [], cuantas: 1 })).toEqual(["2026-10-08T22:00:00.000Z"])
  })

  it("keeps 19:00 local across the change to summer time (Sunday 6 September 2026)", () => {
    const ahora = Date.parse("2026-09-04T15:00:00Z")

    const fechas = proponerFechas({ ahora, horario: HORARIO, ocupadas: [], cuantas: 3 })

    // Saturday 5 is still UTC-4, Tuesday 8 is already UTC-3.
    expect(fechas).toEqual(["2026-09-05T23:00:00.000Z", "2026-09-08T22:00:00.000Z", "2026-09-10T22:00:00.000Z"])
  })

  it("accepts the time as the database gives it", () => {
    const ahora = Date.parse("2026-10-07T15:00:00Z")

    expect(proponerFechas({ ahora, horario: { ...HORARIO, hora: "19:00:00" }, ocupadas: [], cuantas: 1 })).toEqual([
      "2026-10-08T22:00:00.000Z",
    ])
  })

  it("returns nothing when no day is configured", () => {
    expect(proponerFechas({ ahora: Date.now(), horario: { ...HORARIO, dias: [] }, ocupadas: [], cuantas: 3 })).toEqual(
      [],
    )
  })
})

describe("etiquetaDeFecha", () => {
  it("writes the long form Coni reads on the video screen", () => {
    expect(etiquetaDeFecha("2026-10-08T22:00:00.000Z", ZONA, "larga")).toBe("jueves 8 de octubre · 19:00")
  })

  it("writes the short form of the lists", () => {
    expect(etiquetaDeFecha("2026-10-10T22:00:00.000Z", ZONA, "corta")).toBe("sábado 10 · 19:00")
  })
})

describe("semanaDe", () => {
  it("names the Monday to Sunday week in one month", () => {
    expect(semanaDe(Date.parse("2026-10-07T15:00:00Z"), ZONA)).toBe("5 al 11 de octubre")
  })

  it("names both months when the week crosses them", () => {
    expect(semanaDe(Date.parse("2026-09-30T15:00:00Z"), ZONA)).toBe("28 de septiembre al 4 de octubre")
  })
})
