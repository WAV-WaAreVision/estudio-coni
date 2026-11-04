import { describe, expect, it } from "vitest"
import {
  agruparPorAutor,
  agruparPorTema,
  type FilaDeIdeaDeAutor,
  type FilaDeIdeaDeTema,
} from "@/lib/dominio/biblioteca/ideas"

const deAutor = (
  id: string,
  temaId: string | null,
  tema: string,
  creadaEn: string,
  excluida = false,
): FilaDeIdeaDeAutor => ({
  id,
  texto: `Idea ${id}`,
  tipo: "dato",
  evidencia: "estudio",
  excluida,
  temaId,
  tema,
  creadaEn,
})

const deTema = (id: string, autorId: string, autor: string, creadaEn: string): FilaDeIdeaDeTema => ({
  id,
  texto: `Idea ${id}`,
  tipo: "dato",
  evidencia: "estudio",
  autorId,
  autor,
  credencial: autorId === "a1" ? "investigadora" : null,
  creadaEn,
})

describe("agruparPorTema", () => {
  it("groups by topic, most ideas first, ties by name, and the ideas without topic last", () => {
    const { grupos } = agruparPorTema([
      deAutor("1", null, "", "2026-11-01T10:00:00Z"),
      deAutor("2", "t-s", "Sueño", "2026-11-01T10:00:01Z"),
      deAutor("3", "t-c", "Carga mental", "2026-11-01T10:00:02Z"),
      deAutor("4", "t-c", "Carga mental", "2026-11-01T10:00:03Z"),
      deAutor("5", "t-a", "Ánimo", "2026-11-01T10:00:04Z"),
    ])
    expect(grupos.map((grupo) => grupo.tema?.nombre ?? null)).toEqual(["Carga mental", "Ánimo", "Sueño", null])
    expect(grupos[0]?.tema).toEqual({ id: "t-c", nombre: "Carga mental" })
  })

  it("keeps each group oldest first, then by id, whatever order the rows came in", () => {
    const { grupos } = agruparPorTema([
      deAutor("b", "t", "Sueño", "2026-11-01T10:00:00Z"),
      deAutor("c", "t", "Sueño", "2026-10-01T10:00:00Z"),
      deAutor("a", "t", "Sueño", "2026-11-01T10:00:00Z"),
    ])
    expect(grupos[0]?.ideas.map((idea) => idea.id)).toEqual(["c", "a", "b"])
  })

  it("puts the hidden ideas apart, and reads a topic without a name as no topic", () => {
    const { grupos, ocultas } = agruparPorTema([
      deAutor("1", "t", "Sueño", "2026-11-01T10:00:00Z"),
      deAutor("2", null, "", "2026-11-01T10:00:01Z", true),
      deAutor("3", "t-vacio", " ", "2026-11-01T10:00:02Z"),
    ])
    expect(ocultas).toEqual([{ id: "2", texto: "Idea 2", tipo: "dato", evidencia: "estudio" }])
    expect(grupos.map((grupo) => grupo.tema?.id ?? null)).toEqual(["t", null])
  })
})

describe("agruparPorAutor", () => {
  it("groups by author, most ideas first, ties by name, with the credential", () => {
    const grupos = agruparPorAutor([
      deTema("1", "a2", "Bruno", "2026-11-01T10:00:00Z"),
      deTema("2", "a1", "Ana", "2026-11-01T10:00:01Z"),
      deTema("3", "a3", "Ángela", "2026-11-01T10:00:02Z"),
      deTema("4", "a2", "Bruno", "2026-10-01T10:00:00Z"),
    ])
    expect(grupos.map((grupo) => grupo.autor.nombre)).toEqual(["Bruno", "Ana", "Ángela"])
    expect(grupos[0]?.ideas.map((idea) => idea.id)).toEqual(["4", "1"])
    expect(grupos[1]?.autor).toEqual({ id: "a1", nombre: "Ana", credencial: "investigadora" })
  })
})
