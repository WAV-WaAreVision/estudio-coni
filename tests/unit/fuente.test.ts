// @vitest-environment node
import { describe, expect, it } from "vitest"
import { conLineaDeFuente, DE_CONI, fuentesCitadas, lineaDeFuente } from "@/lib/dominio/fuente"
import { AVISO_AVATAR, LINEAS_AYUDA } from "@/lib/dominio/revision"

const de = (autor: string, titulo: string | null = null, anio: number | null = null) => ({
  deConi: false,
  fuente: { autor, titulo, anio },
})
const deConi = { deConi: true, fuente: { autor: "Constanza del Rosario", titulo: "Notas", anio: 2026 } }

describe("lineaDeFuente", () => {
  it.each([
    [
      "one source with title and year",
      [de("Stanford", "AI for Mental Health", 2026)],
      "Fuente: Stanford · AI for Mental Health (2026)",
    ],
    ["one source without year", [de("Stanford", "AI for Mental Health")], "Fuente: Stanford · AI for Mental Health"],
    ["one source without title (a year alone is dropped)", [de("Stanford", null, 2026)], "Fuente: Stanford"],
    [
      "the same source twice counts once",
      [de("OMS", "Informe", 2025), de("OMS", "Informe", 2025)],
      "Fuente: OMS · Informe (2025)",
    ],
    ["two sources", [de("OMS", "Informe", 2025), de("APA", "Guía")], "Fuentes: OMS · Informe (2025); APA · Guía"],
    ["four sources", [de("A", "1"), de("B", "2"), de("C", "3"), de("D", "4")], "Fuentes: A · 1; B · 2 y 2 más"],
    ["Coni's claims next to others are left out", [deConi, de("OMS", "Informe")], "Fuente: OMS · Informe"],
    ["only Coni's own claims", [deConi], DE_CONI],
  ])("%s", (_caso, apoyos, esperada) => {
    expect(lineaDeFuente(apoyos)).toBe(esperada)
  })

  it("has no line without claims", () => {
    expect(lineaDeFuente([])).toBeNull()
  })

  it("has no line for a backing stored before sources existed", () => {
    expect(lineaDeFuente([{ deConi: false }, { deConi: false, fuente: undefined }])).toBeNull()
  })
})

describe("fuentesCitadas", () => {
  it("cites the first two third-party sources, in order", () => {
    expect(fuentesCitadas([deConi, de("A", "1"), de("B", "2"), de("C", "3")]).map((f) => f.autor)).toEqual(["A", "B"])
  })
})

describe("conLineaDeFuente", () => {
  const texto = `Un texto.\n\n#salud\n\n${AVISO_AVATAR}`

  it("puts the line right before the avatar notice", () => {
    expect(conLineaDeFuente(texto, "Fuente: OMS · Informe")).toBe(
      `Un texto.\n\n#salud\n\nFuente: OMS · Informe\n\n${AVISO_AVATAR}`,
    )
  })

  it("goes after the help lines, which come before the notice", () => {
    const conAyuda = `Un texto.\n\n${LINEAS_AYUDA}\n\n${AVISO_AVATAR}`
    expect(conLineaDeFuente(conAyuda, "Fuente: OMS")).toBe(
      `Un texto.\n\n${LINEAS_AYUDA}\n\nFuente: OMS\n\n${AVISO_AVATAR}`,
    )
  })

  it("adds it at the end when the notice is missing (the revision blocks that anyway)", () => {
    expect(conLineaDeFuente("Un texto.", "Fuente: OMS")).toBe("Un texto.\n\nFuente: OMS")
  })

  it("changes nothing without a line, for Coni's own words, or when the line is already there", () => {
    expect(conLineaDeFuente(texto, null)).toBe(texto)
    expect(conLineaDeFuente(texto, DE_CONI)).toBe(texto)
    const conLinea = conLineaDeFuente(texto, "Fuente: OMS")
    expect(conLineaDeFuente(conLinea, "Fuente: OMS")).toBe(conLinea)
  })
})
