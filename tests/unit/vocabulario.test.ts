import { describe, expect, it } from "vitest"
import {
  listaDeMarca,
  normalizarGancho,
  normalizarMarca,
  type Vocabulario,
  vocabularioDeFilas,
} from "@/lib/dominio/vocabulario"

const fila = (lista: string, red: string, id: number, valores: string[], extra: Record<string, string> = {}) => ({
  id,
  lista,
  red,
  valores: valores.map((valor) => ({ valor, etiqueta: valor, ...extra })),
})

const VOCAB: Vocabulario = vocabularioDeFilas([
  fila("tipo", "todas", 1, ["dato", "limite"]),
  fila("evidencia", "todas", 2, ["estudio", "guia_consenso"]),
  fila("publico", "linkedin", 3, ["gerencia"]),
  fila("publico", "instagram", 4, ["se_reinventa"]),
  fila("dolor", "linkedin", 5, ["rrhh_tarde"]),
  fila("dolor", "instagram", 6, ["techo_profesional"]),
  fila("emocion", "todas", 7, ["escepticismo", "verguenza", "otra"], { grupo: "problema" }),
  fila("gancho", "todas", 8, ["escena", "mito"]),
])

describe("vocabularioDeFilas", () => {
  it("fails when a list and network pair has no vigente version", () => {
    expect(() => vocabularioDeFilas([fila("tipo", "todas", 1, ["dato"])])).toThrow(/evidencia/)
  })

  it("drops retired values", () => {
    const v = vocabularioDeFilas([
      fila("tipo", "todas", 1, ["dato"]),
      fila("evidencia", "todas", 2, ["estudio"]),
      fila("publico", "linkedin", 3, ["gerencia"]),
      fila("publico", "instagram", 4, ["se_reinventa"]),
      fila("dolor", "linkedin", 5, ["rrhh_tarde"]),
      fila("dolor", "instagram", 6, ["techo_profesional"]),
      fila("emocion", "todas", 7, ["calma"], { grupo: "solucion" }),
      {
        id: 8,
        lista: "gancho",
        red: "todas",
        valores: [
          { valor: "escena", etiqueta: "Escena", retirado: true },
          { valor: "mito", etiqueta: "Mito" },
        ],
      },
    ])
    expect(v.gancho.todas.valores.map((x) => x.valor)).toEqual(["mito"])
  })
})

describe("listaDeMarca", () => {
  it("maps each mark to its list, and dato and caso to none", () => {
    expect(listaDeMarca("problema")).toBe("dolor")
    expect(listaDeMarca("solucion")).toBe("dolor")
    expect(listaDeMarca("emocion")).toBe("emocion")
    expect(listaDeMarca("publico")).toBe("publico")
    expect(listaDeMarca("dato")).toBeNull()
    expect(listaDeMarca("caso")).toBeNull()
  })
})

describe("normalizarMarca", () => {
  it("keeps a known value and points to its version", () => {
    expect(
      normalizarMarca(VOCAB, {
        marca: "emocion",
        red: "linkedin",
        valor: "Escepticismo",
        frase: "duda",
        certeza: "alta",
        porQue: null,
      }),
    ).toEqual({
      marca: "emocion",
      red: "linkedin",
      valor: "escepticismo",
      frase: "duda",
      certeza: "alta",
      porQue: null,
      versionId: 7,
    })
  })

  it("turns an unknown emotion into otra with a reason, keeping the phrase", () => {
    const r = normalizarMarca(VOCAB, {
      marca: "emocion",
      red: "instagram",
      valor: "nostalgia",
      frase: null,
      certeza: "media",
      porQue: null,
    })
    expect(r).toMatchObject({ valor: "otra", frase: "nostalgia", porQue: "fuera de la lista: nostalgia", versionId: 7 })
  })

  it("turns an unknown pain into otro", () => {
    const r = normalizarMarca(VOCAB, {
      marca: "problema",
      red: "linkedin",
      valor: "burnout",
      frase: "agotamiento",
      certeza: "baja",
      porQue: null,
    })
    expect(r).toMatchObject({ valor: "otro", frase: "agotamiento", porQue: "fuera de la lista: burnout", versionId: 5 })
  })

  it("forces dato and caso to todas with no list", () => {
    const r = normalizarMarca(VOCAB, {
      marca: "dato",
      red: "linkedin",
      valor: "30% más",
      frase: "30% más",
      certeza: "alta",
      porQue: null,
    })
    expect(r).toMatchObject({ red: "todas", versionId: null })
  })

  it("does not throw for a per-network mark sent with red todas", () => {
    expect(() =>
      normalizarMarca(VOCAB, {
        marca: "publico",
        red: "todas",
        valor: "gerencia",
        frase: null,
        certeza: "alta",
        porQue: null,
      }),
    ).not.toThrow()
  })
})

describe("normalizarGancho", () => {
  it("keeps a known type and turns an unknown one into ninguno", () => {
    expect(normalizarGancho(VOCAB, "Escena")).toEqual({ tipo: "escena", versionId: 8 })
    expect(normalizarGancho(VOCAB, "rima")).toEqual({ tipo: "ninguno", versionId: 8 })
  })
})
