import { describe, expect, it } from "vitest"
import { type AutorDeLista, autoresParecidos, buscarAutores, normalizar } from "@/lib/dominio/biblioteca/autores"
import { armarMapa, masFrecuentesPrimero } from "@/lib/dominio/biblioteca/mapa"

const autor = (id: string, nombre: string, alias: string[] = []): AutorDeLista => ({
  id,
  nombre,
  credencial: null,
  tipo: "persona",
  alias,
})
const AUTORES = [autor("1", "Esther Perel", ["@estherperel"]), autor("2", "Instituto Gottman"), autor("3", "Ana")]

describe("authors", () => {
  it("compares names without accents, case or extra spaces", () => {
    expect(normalizar("  Ánima   Ruiz ")).toBe("anima ruiz")
  })

  it("finds by name or alias, and lists everyone with nothing typed", () => {
    expect(buscarAutores(AUTORES, "perel").map((a) => a.id)).toEqual(["1"])
    expect(buscarAutores(AUTORES, "@esther").map((a) => a.id)).toEqual(["1"])
    expect(buscarAutores(AUTORES, " ")).toHaveLength(3)
  })

  it("suggests look-alikes for a new name, never for two letters", () => {
    expect(autoresParecidos(AUTORES, "gottman").map((a) => a.id)).toEqual(["2"])
    expect(autoresParecidos(AUTORES, "an")).toEqual([])
  })
})

describe("armarMapa", () => {
  const fila = (tema: string | null, tipo: string, evidencia: string) => ({
    tema_id: tema,
    tipo,
    evidencia,
    temas: tema ? { nombre: tema === "t1" ? "Sueño" : "Ánimo" } : null,
  })

  it("counts ideas by topic (most first, then by name), by type and by evidence, and those without a topic", () => {
    const mapa = armarMapa([
      fila("t1", "dato", "estudio"),
      fila("t2", "mito", "opinion"),
      fila("t1", "dato", "estudio"),
      fila(null, "consejo", "estudio"),
    ])
    expect(mapa).toEqual({
      total: 4,
      temas: [
        { id: "t1", nombre: "Sueño", afirmaciones: 2 },
        { id: "t2", nombre: "Ánimo", afirmaciones: 1 },
      ],
      sinTema: 1,
      tipos: { dato: 2, mito: 1, consejo: 1 },
      evidencia: { estudio: 3, opinion: 1 },
    })
  })

  it("orders counts most first with their words", () => {
    expect(masFrecuentesPrimero({ mito: 1, dato: 2, raro: 1 }, { mito: "Mito", dato: "Dato" })).toEqual([
      { clave: "dato", texto: "Dato", cantidad: 2 },
      { clave: "mito", texto: "Mito", cantidad: 1 },
      { clave: "raro", texto: "raro", cantidad: 1 },
    ])
  })
})
