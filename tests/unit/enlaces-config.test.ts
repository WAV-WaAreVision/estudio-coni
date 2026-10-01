// @vitest-environment node
import { describe, expect, it } from "vitest"
import { enlacesVisibles } from "@/lib/enlaces/config"

const agenda = {
  id: "agenda",
  titulo: "Agenda una consulta",
  detalle: "Adolescentes, adultos y parejas",
  url: "https://agenda.test/coni",
}

describe("enlacesVisibles", () => {
  it("keeps the links that have an address, in the order they were written", () => {
    const libros = { id: "libros", titulo: "Mis libros", detalle: "", url: "https://libros.test" }
    expect(enlacesVisibles([agenda, libros])).toEqual([agenda, libros])
  })

  it("hides a link that has no address yet instead of showing a dead one", () => {
    expect(enlacesVisibles([agenda, { ...agenda, id: "taller", url: null }])).toEqual([agenda])
    expect(enlacesVisibles([{ ...agenda, url: "" }])).toEqual([])
  })

  it("hides a link whose address is not a web address, so a bad entry can never run code", () => {
    expect(enlacesVisibles([{ ...agenda, url: "javascript:alert(1)" }])).toEqual([])
    expect(enlacesVisibles([{ ...agenda, url: "data:text/html,hola" }])).toEqual([])
    expect(enlacesVisibles([{ ...agenda, url: "no es una url" }])).toEqual([])
  })

  it("skips a broken entry and keeps the rest: the page never turns into an error", () => {
    expect(enlacesVisibles([{ id: 3 }, "texto", null, agenda, { ...agenda, id: "con espacios" }])).toEqual([agenda])
  })

  it("answers with no links when the setting is not a list", () => {
    expect(enlacesVisibles(null)).toEqual([])
    expect(enlacesVisibles({ id: "agenda" })).toEqual([])
    expect(enlacesVisibles("agenda")).toEqual([])
  })

  it("keeps the first of two links with the same id", () => {
    expect(enlacesVisibles([agenda, { ...agenda, url: "https://otra.test" }])).toEqual([agenda])
  })

  it("trims the texts and falls back to an empty detail", () => {
    expect(enlacesVisibles([{ id: "agenda", titulo: "  Agenda  ", url: "https://agenda.test" }])).toEqual([
      { id: "agenda", titulo: "Agenda", detalle: "", url: "https://agenda.test" },
    ])
  })
})
