import { describe, expect, it } from "vitest"
import { subidoEnFrase, subidoHace, ZONA_DE_LA_BIBLIOTECA } from "@/lib/dominio/biblioteca/fechas"
import { temasPrincipales, textoDeTema } from "@/lib/dominio/biblioteca/temas"

const idea = (materialId: string, temaId: string | null, nombre: string, excluida = false) => ({
  materialId,
  temaId,
  nombre,
  excluida,
})

describe("temasPrincipales (D8)", () => {
  it("picks the topic with the most ideas and counts the others", () => {
    const temas = temasPrincipales([
      idea("m", "t1", "Sueño"),
      idea("m", "t2", "Carga mental"),
      idea("m", "t2", "Carga mental"),
      idea("m", "t3", "Ánimo"),
    ])
    expect(temas.get("m")).toEqual({ nombre: "Carga mental", otros: 2 })
  })

  it("breaks a tie by the name first in Spanish order", () => {
    const temas = temasPrincipales([idea("m", "t1", "Sueño"), idea("m", "t2", "Ánimo")])
    expect(temas.get("m")).toEqual({ nombre: "Ánimo", otros: 1 })
  })

  it("leaves out excluded ideas and ideas without a topic", () => {
    const temas = temasPrincipales([
      idea("m", "t1", "Sueño"),
      idea("m", "t2", "Ánimo", true),
      idea("m", "t2", "Ánimo", true),
      idea("m", null, ""),
      idea("m", null, ""),
    ])
    expect(temas.get("m")).toEqual({ nombre: "Sueño", otros: 0 })
  })

  it("never makes a topic with a blank name the main topic, nor counts it among the others", () => {
    const temas = temasPrincipales([
      idea("m", "t1", "   "),
      idea("m", "t1", "   "),
      idea("m", "t2", ""),
      idea("m", "t2", ""),
      idea("m", "t3", "Sueño"),
      idea("solo-vacios", "t1", " "),
    ])
    expect(temas.get("m")).toEqual({ nombre: "Sueño", otros: 0 })
    expect(temas.has("solo-vacios")).toBe(false)
  })

  it("has nothing for a material without ideas, and keeps materials apart", () => {
    const temas = temasPrincipales([idea("a", "t1", "Sueño"), idea("b", "t2", "Ánimo"), idea("c", "t1", "Sueño", true)])
    expect(temas.get("a")).toEqual({ nombre: "Sueño", otros: 0 })
    expect(temas.get("b")).toEqual({ nombre: "Ánimo", otros: 0 })
    expect(temas.has("c")).toBe(false)
    expect(temas.has("d")).toBe(false)
  })

  it("counts more than a thousand ideas of one material", () => {
    const filas = [...Array.from({ length: 1001 }, () => idea("m", "t1", "Sueño")), idea("m", "t2", "Ánimo")]
    expect(temasPrincipales(filas).get("m")).toEqual({ nombre: "Sueño", otros: 1 })
  })
})

describe("textoDeTema", () => {
  it("shows +N and reads it out in words", () => {
    expect(textoDeTema({ nombre: "Carga mental", otros: 2 })).toEqual({
      visible: "Carga mental +2",
      leido: "Carga mental y 2 temas más",
    })
    expect(textoDeTema({ nombre: "Sueño", otros: 1 })).toEqual({ visible: "Sueño +1", leido: "Sueño y 1 tema más" })
    expect(textoDeTema({ nombre: "Sueño", otros: 0 })).toEqual({ visible: "Sueño", leido: "Sueño" })
    expect(textoDeTema(null)).toEqual({ visible: "Sin tema todavía", leido: "Sin tema todavía" })
  })
})

describe("subidoHace (D7, America/Santiago)", () => {
  // 2 Nov 2026, 12:00 in Santiago (UTC-3 since the first Sunday of September).
  const AHORA = Date.parse("2026-11-02T15:00:00Z")

  it.each([
    ["2026-11-02T03:30:00Z", "Hoy"],
    ["2026-11-02T02:30:00Z", "Ayer"],
    ["2026-10-31T12:00:00Z", "Hace 2 días"],
    ["2026-10-27T12:00:00Z", "Hace 6 días"],
    ["2026-10-26T12:00:00Z", "26 de octubre"],
    ["2026-10-20T12:00:00Z", "20 de octubre"],
    ["2025-12-24T12:00:00Z", "24 de diciembre de 2025"],
  ])("says %s as «%s»", (instante, texto) => {
    expect(subidoHace(instante, AHORA, ZONA_DE_LA_BIBLIOTECA)).toBe(texto)
  })

  it("counts calendar days across Chile's September clock change, not elapsed hours", () => {
    // Clocks jump from UTC-4 to UTC-3 on 6 Sep 2026: 5 Sep 23:30 to 7 Sep 00:30 local is only 24 hours apart.
    const DESPUES_DEL_CAMBIO = Date.parse("2026-09-07T03:30:00Z")
    expect(subidoHace("2026-09-06T03:30:00Z", DESPUES_DEL_CAMBIO, ZONA_DE_LA_BIBLIOTECA)).toBe("Hace 2 días")
  })

  it("puts it in a sentence for the side panel", () => {
    expect(subidoEnFrase("2026-10-31T12:00:00Z", AHORA, ZONA_DE_LA_BIBLIOTECA)).toBe("subido hace 2 días")
    expect(subidoEnFrase("2026-11-02T12:00:00Z", AHORA, ZONA_DE_LA_BIBLIOTECA)).toBe("subido hoy")
    expect(subidoEnFrase("2026-10-20T12:00:00Z", AHORA, ZONA_DE_LA_BIBLIOTECA)).toBe("subido el 20 de octubre")
  })

  it("refuses an instant it cannot read", () => {
    expect(() => subidoHace("ayer", AHORA, ZONA_DE_LA_BIBLIOTECA)).toThrow(/ilegible/)
  })
})
