import { describe, expect, it } from "vitest"
import { armarAnotacion, asuntoDelRecordatorio, leerCifra, postsPorAnotar } from "@/lib/metricas/linkedin"

// Monday 19 Oct 2026, 03:00 in Santiago.
const LUNES = Date.parse("2026-10-19T06:00:00.000Z")
const ZONA = "America/Santiago"
const post = (piezaId: string, publicadoEn: string) => ({ piezaId, titulo: `Post ${piezaId}`, publicadoEn })

describe("postsPorAnotar", () => {
  it("asks for the posts of the last four weeks that have no row this week, newest first", () => {
    const pendientes = postsPorAnotar({
      posts: [
        post("viejo", "2026-09-20T22:00:00.000Z"), // 29 days ago
        post("a", "2026-09-22T22:00:00.000Z"),
        post("b", "2026-10-14T22:00:00.000Z"),
        post("anotado", "2026-10-15T22:00:00.000Z"),
        post("futuro", "2026-10-20T22:00:00.000Z"),
      ],
      medidos: [
        { piezaId: "a", medidoEn: "2026-10-12" }, // last week: pending again
        { piezaId: "anotado", medidoEn: "2026-10-19" },
      ],
      ahora: LUNES,
      zona: ZONA,
    })

    expect(pendientes.map((p) => p.piezaId)).toEqual(["b", "a"])
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
    })
  })

  it("tells a figure with letters or signs apart from a missing one", () => {
    expect(armarAnotacion([{ piezaId: "a", titulo: "Si van", campos: { ...lleno, reacciones: "14a" } }], "")).toEqual({
      ok: false,
      error: "Las cifras de «Si van» van como número, sin letras ni signos.",
    })
  })

  it("refuses followers that are not a count, and an empty save", () => {
    expect(armarAnotacion([], "mil")).toEqual({
      ok: false,
      error: "Los seguidores van como un número, sin letras.",
    })
    expect(armarAnotacion([{ piezaId: "a", titulo: "A", campos: vacio }], "")).toEqual({
      ok: false,
      error: "Anota al menos un post o los seguidores.",
    })
  })
})
