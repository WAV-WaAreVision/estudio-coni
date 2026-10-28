import { describe, expect, it } from "vitest"
import {
  etiquetaDeDia,
  etiquetaDeFecha,
  horaElegida,
  horaEnBloques,
  instanteLocal,
  MOTIVOS_DE_HORA,
  proponerFechas,
  semanaDe,
} from "@/lib/dominio/fechas"

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

describe("horaElegida", () => {
  // Wednesday 28 October 2026, 08:45 in Santiago (UTC-3).
  const AHORA = Date.parse("2026-10-28T11:45:00Z")
  const elegir = (dia: string, hora: string, ahora = AHORA) => horaElegida({ dia, hora, zona: ZONA, ahora })

  it("reads a Chile day and time in summer time as UTC", () => {
    expect(elegir("2026-10-28", "10:15")).toEqual({ ok: true, iso: "2026-10-28T13:15:00.000Z" })
  })

  it("reads a Chile day and time in winter time as UTC", () => {
    expect(elegir("2026-07-02", "10:00", Date.parse("2026-07-01T12:00:00Z"))).toEqual({
      ok: true,
      iso: "2026-07-02T14:00:00.000Z",
    })
  })

  it("accepts the seconds a time field may add", () => {
    expect(elegir("2026-10-28", "10:15:00")).toEqual({ ok: true, iso: "2026-10-28T13:15:00.000Z" })
  })

  it("asks for the day when it is missing or not a real day", () => {
    expect(elegir("", "10:15")).toEqual({ ok: false, motivo: MOTIVOS_DE_HORA.dia })
    expect(elegir("2026-02-30", "10:15")).toEqual({ ok: false, motivo: MOTIVOS_DE_HORA.dia })
  })

  it("asks for the time when it is missing or not a real time", () => {
    expect(elegir("2026-10-28", "")).toEqual({ ok: false, motivo: MOTIVOS_DE_HORA.hora })
    expect(elegir("2026-10-28", "25:00")).toEqual({ ok: false, motivo: MOTIVOS_DE_HORA.hora })
  })

  it("refuses a minute that is not a multiple of 5, since the publisher runs every 5 minutes", () => {
    expect(elegir("2026-10-28", "10:07")).toEqual({ ok: false, motivo: MOTIVOS_DE_HORA.paso })
  })

  it("needs at least 15 minutes ahead, and exactly 15 is enough", () => {
    expect(elegir("2026-10-28", "08:55")).toEqual({ ok: false, motivo: MOTIVOS_DE_HORA.anticipacion })
    expect(elegir("2026-10-28", "09:00")).toEqual({ ok: true, iso: "2026-10-28T12:00:00.000Z" })
  })

  it("refuses a time that already passed with the same words", () => {
    expect(elegir("2026-10-27", "19:00")).toEqual({ ok: false, motivo: MOTIVOS_DE_HORA.anticipacion })
  })

  it("refuses a day more than 400 days ahead", () => {
    expect(elegir("2027-12-31", "19:00")).toEqual({ ok: false, motivo: MOTIVOS_DE_HORA.lejos })
  })

  it("accepts up to exactly 400 days ahead and refuses the next block", () => {
    expect(elegir("2027-12-02", "08:40")).toEqual({ ok: true, iso: "2027-12-02T11:40:00.000Z" })
    expect(elegir("2027-12-02", "08:45")).toEqual({ ok: true, iso: "2027-12-02T11:45:00.000Z" })
    expect(elegir("2027-12-02", "08:50")).toEqual({ ok: false, motivo: MOTIVOS_DE_HORA.lejos })
  })

  it("refuses a minute, an hour or a month out of range", () => {
    expect(elegir("2026-10-28", "10:60")).toEqual({ ok: false, motivo: MOTIVOS_DE_HORA.hora })
    expect(elegir("2026-10-28", "24:00")).toEqual({ ok: false, motivo: MOTIVOS_DE_HORA.hora })
    expect(elegir("2026-13-01", "10:15")).toEqual({ ok: false, motivo: MOTIVOS_DE_HORA.dia })
  })

  it("refuses a time that does not exist in Chile when summer time starts", () => {
    const antes = Date.parse("2026-09-01T12:00:00Z")
    expect(elegir("2026-09-06", "00:30", antes)).toEqual({ ok: false, motivo: MOTIVOS_DE_HORA.noExiste })
    expect(elegir("2027-09-05", "00:30", Date.parse("2027-09-01T12:00:00Z"))).toEqual({
      ok: false,
      motivo: MOTIVOS_DE_HORA.noExiste,
    })
    expect(elegir("2026-09-06", "01:00", antes)).toEqual({ ok: true, iso: "2026-09-06T04:00:00.000Z" })
  })

  it("takes the first of the two times a repeated hour has when summer time ends", () => {
    expect(elegir("2026-04-04", "23:30", Date.parse("2026-04-01T12:00:00Z"))).toEqual({
      ok: true,
      iso: "2026-04-05T02:30:00.000Z",
    })
  })
})

describe("etiquetaDeDia", () => {
  it("names a calendar day in Chile", () => {
    expect(etiquetaDeDia("2026-10-28", ZONA)).toBe("miércoles 28 de octubre")
  })

  it("names the day summer time starts, whose midnight does not exist", () => {
    expect(etiquetaDeDia("2026-09-06", ZONA)).toBe("domingo 6 de septiembre")
  })

  it("is empty for an unreadable day", () => {
    expect(etiquetaDeDia("", ZONA)).toBe("")
  })
})

describe("horaEnBloques", () => {
  it("rounds the schedule hour down to 5 minutes and drops the seconds", () => {
    expect(horaEnBloques("19:07:00")).toBe("19:05")
    expect(horaEnBloques("19:00")).toBe("19:00")
  })

  it("is empty for an unreadable hour", () => {
    expect(horaEnBloques("")).toBe("")
  })
})
