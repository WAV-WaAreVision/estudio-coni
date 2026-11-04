import { describe, expect, it } from "vitest"
import {
  type AutorDeLista,
  armarResumenDeAutores,
  buscarAutores,
  descripcionDeAutor,
  hrefDeAutor,
  hrefDeAutores,
  sePuedeUnir,
} from "@/lib/dominio/biblioteca/autores"

const autor = (id: string, nombre: string, extra: Partial<AutorDeLista> = {}): AutorDeLista => ({
  id,
  nombre,
  credencial: null,
  tipo: "persona",
  alias: [],
  ...extra,
})
const AUTORES = [autor("a", "Ana"), autor("b", "Bruno"), autor("c", "Carla"), autor("d", "Dante")]
const idea = (autorId: string, temaId: string | null, tema = temaId ? `Tema ${temaId}` : "") => ({
  autorId,
  temaId,
  tema,
})

describe("armarResumenDeAutores", () => {
  it("counts each author's materials and visible ideas", () => {
    const [primero] = armarResumenDeAutores(AUTORES, [{ autorId: "b" }, { autorId: "b" }], [idea("b", "t1")])
    expect(primero).toMatchObject({ id: "b", materiales: 2, ideas: 1 })
  })

  it("orders by most ideas first, then by name in Spanish order", () => {
    const resumen = armarResumenDeAutores(
      [autor("1", "Zoe"), autor("2", "Álvaro"), autor("3", "Bea")],
      [],
      [idea("1", null), idea("1", null), idea("3", null), idea("2", null)],
    )
    expect(resumen.map((a) => a.nombre)).toEqual(["Zoe", "Álvaro", "Bea"])
  })

  it("keeps an author with nothing, with zero counts and no topics", () => {
    const resumen = armarResumenDeAutores(AUTORES, [], [])
    expect(resumen.find((a) => a.id === "d")).toEqual({ ...AUTORES[3], materiales: 0, ideas: 0, temas: [] })
  })

  it("gives the three topics with most ideas, ties by name, leaving out ideas without a topic or a name", () => {
    const [ana] = armarResumenDeAutores(
      [AUTORES[0] ?? autor("a", "Ana")],
      [],
      [
        idea("a", "t1", "Sueño"),
        idea("a", "t2", "Ánimo"),
        idea("a", "t3", "Carga mental"),
        idea("a", "t3", "Carga mental"),
        idea("a", "t4", "Pausas"),
        idea("a", null),
        idea("a", "t5", "  "),
      ],
    )
    expect(ana?.ideas).toBe(7)
    expect(ana?.temas).toEqual([
      { id: "t3", nombre: "Carga mental", ideas: 2 },
      { id: "t2", nombre: "Ánimo", ideas: 1 },
      { id: "t4", nombre: "Pausas", ideas: 1 },
    ])
  })
})

describe("buscarAutores on the summary", () => {
  it("keeps the summary's fields, matching name or alias without accents or case", () => {
    const resumen = armarResumenDeAutores(
      [autor("1", "Daniela Ruiz", { alias: ["D. Ruiz"] }), autor("2", "Ana")],
      [],
      [],
    )
    const encontrados = buscarAutores(resumen, "RUÍZ")
    expect(encontrados.map((a) => a.id)).toEqual(["1"])
    expect(encontrados[0]?.materiales).toBe(0)
    expect(buscarAutores(resumen, "d. ruiz").map((a) => a.id)).toEqual(["1"])
    expect(buscarAutores(resumen, "zzz")).toEqual([])
  })
})

describe("an author's words and addresses", () => {
  it("says the kind and the credential", () => {
    expect(descripcionDeAutor(autor("1", "Daniela", { credencial: "investigadora" }))).toBe("Persona · investigadora")
    expect(descripcionDeAutor(autor("2", "Coni", { tipo: "coni" }))).toBe("Coni")
  })

  it("links the detail and the side panel", () => {
    expect(hrefDeAutor("a-1")).toBe("/biblioteca/autores/a-1")
    expect(hrefDeAutores("a-1")).toBe("/biblioteca/autores?a=a-1")
    expect(hrefDeAutores()).toBe("/biblioteca/autores")
  })

  it("never offers Coni's own card as the one that disappears", () => {
    expect(sePuedeUnir({ tipo: "coni" })).toBe(false)
    expect(sePuedeUnir({ tipo: "persona" })).toBe(true)
  })
})
