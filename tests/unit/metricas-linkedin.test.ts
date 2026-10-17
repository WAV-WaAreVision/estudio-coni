import { describe, expect, it } from "vitest"
import {
  armarAnotacion,
  asuntoDelRecordatorio,
  leerCifra,
  postsPorAnotar,
  sinNumerosEstaSemana,
} from "@/lib/metricas/linkedin"

// Monday 19 Oct 2026, 03:00 in Santiago.
const LUNES = Date.parse("2026-10-19T06:00:00.000Z")
const ZONA = "America/Santiago"
const post = (piezaId: string, publicadoEn: string) => ({ piezaId, titulo: `Post ${piezaId}`, publicadoEn })

describe("postsPorAnotar", () => {
  const fila = (piezaId: string, medidoEn: string, origen = "manual") => ({
    piezaId,
    medidoEn,
    origen,
    impresiones: 1200,
    reacciones: 14,
    comentarios: 3,
    compartidos: 1,
  })

  it("lists the posts of the last four weeks, newest first, with this week's manual numbers to correct", () => {
    const posts = postsPorAnotar({
      posts: [
        post("viejo", "2026-09-20T22:00:00.000Z"), // 29 days ago
        post("a", "2026-09-22T22:00:00.000Z"),
        post("b", "2026-10-14T22:00:00.000Z"),
        post("anotado", "2026-10-15T22:00:00.000Z"),
        post("api", "2026-10-16T22:00:00.000Z"),
        post("futuro", "2026-10-20T22:00:00.000Z"),
      ],
      medidos: [
        fila("a", "2026-10-12"), // last week: to note again
        fila("anotado", "2026-10-19"),
        fila("api", "2026-10-19", "api"), // an automated row is not hers to correct
      ],
      ahora: LUNES,
      zona: ZONA,
    })

    expect(posts.map((p) => [p.piezaId, p.estaSemana])).toEqual([
      ["anotado", { impresiones: 1200, reacciones: 14, comentarios: 3, compartidos: 1 }],
      ["b", null],
      ["a", null],
    ])
    expect(sinNumerosEstaSemana(posts).map((p) => p.piezaId)).toEqual(["b", "a"])
  })
})

describe("asuntoDelRecordatorio", () => {
  it("names how many posts, singular included", () => {
    expect(asuntoDelRecordatorio(1)).toBe("Anota los números de LinkedIn (1 post)")
    expect(asuntoDelRecordatorio(3)).toBe("Anota los números de LinkedIn (3 posts)")
  })
})

describe("leerCifra", () => {
  it.each([
    ["1200", 1200],
    ["1.200", 1200],
    ["12.345.678", 12_345_678],
    [" 1200 ", 1200],
    ["0", 0],
    ["", null],
    ["  ", null],
    ["12a", "invalida"],
    ["-3", "invalida"],
    ["1,5", "invalida"],
    ["1.2", "invalida"],
    ["1.25", "invalida"],
    ["12.00.0", "invalida"],
    ["1 200", "invalida"],
  ])("reads %j as %j", (texto, esperado) => {
    expect(leerCifra(texto)).toBe(esperado)
  })
})

describe("armarAnotacion", () => {
  const vacio = { impresiones: "", reacciones: "", comentarios: "", compartidos: "" }
  const lleno = { impresiones: "1.200", reacciones: "14", comentarios: "3", compartidos: "1" }

  it("keeps complete posts, skips empty ones and reads the followers", () => {
    expect(
      armarAnotacion(
        [
          { piezaId: "a", titulo: "A", campos: lleno },
          { piezaId: "b", titulo: "B", campos: vacio },
        ],
        "830",
      ),
    ).toEqual({
      ok: true,
      anotacion: {
        posts: [{ piezaId: "a", impresiones: 1200, reacciones: 14, comentarios: 3, compartidos: 1 }],
        seguidores: 830,
      },
    })
  })

  it("refuses a half-filled post, naming it", () => {
    expect(armarAnotacion([{ piezaId: "a", titulo: "Si van", campos: { ...vacio, impresiones: "5" } }], "")).toEqual({
      ok: false,
      error: "Completa los cuatro números de «Si van» o déjalos todos vacíos.",
      campo: { piezaId: "a", campo: "reacciones" },
    })
  })

  it("tells a figure with letters or signs apart from a missing one", () => {
    expect(armarAnotacion([{ piezaId: "a", titulo: "Si van", campos: { ...lleno, reacciones: "14a" } }], "")).toEqual({
      ok: false,
      error: "Las cifras de «Si van» van como número, sin letras ni signos.",
      campo: { piezaId: "a", campo: "reacciones" },
    })
  })

  it("refuses followers that are not a count, and an empty save", () => {
    expect(armarAnotacion([], "mil")).toEqual({
      ok: false,
      error: "Los seguidores van como un número, sin letras.",
      campo: "seguidores",
    })
    expect(armarAnotacion([{ piezaId: "a", titulo: "A", campos: vacio }], "")).toEqual({
      ok: false,
      error: "Anota al menos un post o los seguidores.",
    })
  })
})
