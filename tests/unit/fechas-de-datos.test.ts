// @vitest-environment node
import { describe, expect, it } from "vitest"
import { diaAntes, diaEnPalabras, instanteEnPalabras, unAnioDespues } from "@/lib/datos-personales/fechas"

const ZONA = "America/Santiago"

describe("diaAntes", () => {
  it("counts calendar days back, across a month", () => {
    expect(diaAntes("2026-03-01", 1)).toBe("2026-02-28")
    expect(diaAntes("2027-11-15", 30)).toBe("2027-10-16")
  })

  it("refuses a day that is not YYYY-MM-DD or does not exist", () => {
    for (const dia of ["2026-11-1", "2026-11-01T00:00:00Z", "ayer", "2026-02-30", "2026-13-01"]) {
      expect(() => diaAntes(dia, 1)).toThrow(`Día ilegible: ${dia}`)
    }
  })
})

describe("unAnioDespues", () => {
  it("is the same day next year, and 1 March after a 29 February", () => {
    expect(unAnioDespues("2026-11-01")).toBe("2027-11-01")
    expect(unAnioDespues("2028-02-29")).toBe("2029-03-01")
  })
})

describe("diaEnPalabras", () => {
  it("names a calendar day with its year", () => {
    expect(diaEnPalabras("2027-11-15")).toBe("15 de noviembre de 2027")
  })

  it("refuses an unreadable day", () => {
    expect(() => diaEnPalabras("15-11-2027")).toThrow("Día ilegible: 15-11-2027")
  })
})

describe("instanteEnPalabras", () => {
  it("names the day in Chile, with or without the year", () => {
    expect(instanteEnPalabras("2026-11-02T06:00:00Z", ZONA, { anio: false })).toBe("2 de noviembre")
    // 02:00 UTC is still 23:00 of the day before in Santiago.
    expect(instanteEnPalabras("2026-11-02T02:00:00Z", ZONA, { anio: true })).toBe("1 de noviembre de 2026")
  })

  it("refuses an unreadable instant", () => {
    expect(() => instanteEnPalabras("ayer", ZONA, { anio: true })).toThrow("Instante ilegible: ayer")
  })
})
