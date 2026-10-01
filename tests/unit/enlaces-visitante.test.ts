// @vitest-environment node
import { describe, expect, it } from "vitest"
import { huellaDeVisitante, ipDeLaSolicitud, salDelDia } from "@/lib/enlaces/visitante"

const SECRETO = "secreto-del-servidor-que-nunca-se-guarda"
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) Safari/604.1"

describe("huellaDeVisitante", () => {
  it("is the same for the same person on the same day", () => {
    const a = huellaDeVisitante({ secreto: SECRETO, dia: "2026-10-09", ip: "190.20.30.40", agente: UA })
    const b = huellaDeVisitante({ secreto: SECRETO, dia: "2026-10-09", ip: "190.20.30.40", agente: UA })
    expect(a).toBe(b)
  })

  it("changes with the day, so nobody can be followed from one day to the next", () => {
    const hoy = huellaDeVisitante({ secreto: SECRETO, dia: "2026-10-09", ip: "190.20.30.40", agente: UA })
    const manana = huellaDeVisitante({ secreto: SECRETO, dia: "2026-10-10", ip: "190.20.30.40", agente: UA })
    expect(hoy).not.toBe(manana)
  })

  it("tells two people apart by address or by device", () => {
    const base = { secreto: SECRETO, dia: "2026-10-09", ip: "190.20.30.40", agente: UA }
    expect(huellaDeVisitante(base)).not.toBe(huellaDeVisitante({ ...base, ip: "190.20.30.41" }))
    expect(huellaDeVisitante(base)).not.toBe(huellaDeVisitante({ ...base, agente: `${UA} otro` }))
  })

  it("changes with the server secret, which is the one thing nobody can recompute from outside", () => {
    const base = { dia: "2026-10-09", ip: "190.20.30.40", agente: UA }
    expect(huellaDeVisitante({ ...base, secreto: SECRETO })).not.toBe(huellaDeVisitante({ ...base, secreto: "otro" }))
  })

  it("is a hex digest that carries neither the address nor the device", () => {
    const huella = huellaDeVisitante({ secreto: SECRETO, dia: "2026-10-09", ip: "190.20.30.40", agente: UA })
    expect(huella).toMatch(/^[0-9a-f]{64}$/)
    expect(huella).not.toContain("190.20.30.40")
  })

  it("derives the day's salt from the secret and the day, so it needs no storage", () => {
    expect(salDelDia(SECRETO, "2026-10-09")).toBe(salDelDia(SECRETO, "2026-10-09"))
    expect(salDelDia(SECRETO, "2026-10-09")).not.toBe(salDelDia(SECRETO, "2026-10-10"))
  })
})

describe("ipDeLaSolicitud", () => {
  it("takes the client address the platform put first in x-forwarded-for", () => {
    expect(ipDeLaSolicitud(new Headers({ "x-forwarded-for": "190.20.30.40, 10.0.0.1" }))).toBe("190.20.30.40")
  })

  it("falls back to x-real-ip, then to nothing", () => {
    expect(ipDeLaSolicitud(new Headers({ "x-real-ip": "190.20.30.40" }))).toBe("190.20.30.40")
    expect(ipDeLaSolicitud(new Headers())).toBe("")
  })
})
