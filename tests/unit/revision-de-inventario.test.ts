// @vitest-environment node
import { describe, expect, it } from "vitest"
import { revisionPorAvisar, venceLaRevision } from "@/lib/datos-personales/revision"

const ZONA = "America/Santiago"

describe("venceLaRevision", () => {
  it("is due a year after the register started while she never reviewed it", () => {
    expect(venceLaRevision({ ultima: null, desde: "2026-11-15", zona: ZONA })).toBe("2027-11-15")
  })

  it("is due a year after her latest review, on her calendar", () => {
    // 02:00 UTC on 10 March is still 9 March in Santiago.
    expect(venceLaRevision({ ultima: "2027-03-10T02:00:00Z", desde: "2026-11-15", zona: ZONA })).toBe("2028-03-09")
  })

  it("moves a 29 February to 1 March", () => {
    expect(venceLaRevision({ ultima: null, desde: "2028-02-29", zona: ZONA })).toBe("2029-03-01")
  })
})

describe("revisionPorAvisar", () => {
  const VENCE = "2027-11-15"

  it("waits until 30 days before the due date", () => {
    expect(revisionPorAvisar({ vence: VENCE, avisada: null, hoy: "2027-10-15" })).toBe(false)
    expect(revisionPorAvisar({ vence: VENCE, avisada: null, hoy: "2027-10-16" })).toBe(true)
  })

  it("still tells when the due date already passed without a notice", () => {
    expect(revisionPorAvisar({ vence: VENCE, avisada: null, hoy: "2027-12-01" })).toBe(true)
  })

  it("tells once per due date", () => {
    expect(revisionPorAvisar({ vence: VENCE, avisada: VENCE, hoy: "2027-10-20" })).toBe(false)
    expect(revisionPorAvisar({ vence: VENCE, avisada: "2026-11-15", hoy: "2027-10-20" })).toBe(true)
  })
})
