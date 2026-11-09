import { describe, expect, it } from "vitest"
import { cruzarConPiezas, type PublicacionDeLinkedin } from "@/lib/metricas/excel-linkedin/cruzar"
import type { ExcelDeLinkedin, PostDelExcel, TipoDePost } from "@/lib/metricas/excel-linkedin/leer"

const ZONA = "America/Santiago"

const post = (
  tipo: TipoDePost,
  numero: string,
  fecha: string,
  impresiones = 1000,
  interacciones = 10,
): PostDelExcel => ({
  tipo,
  numero,
  fecha,
  impresiones,
  interacciones,
})

const excel = (publicaciones: PostDelExcel[], extra: Partial<ExcelDeLinkedin> = {}): ExcelDeLinkedin => ({
  periodo: { desde: "2026-10-01", hasta: "2026-10-30" },
  publicaciones,
  seguidores: 830,
  llegoAlTope: false,
  sinIdentificar: 0,
  ...extra,
})

// 15:00 UTC is noon in Santiago: the day stays the same.
const pieza = (piezaId: string, dia: string, postUrn: string | null = null): PublicacionDeLinkedin => ({
  piezaId,
  titulo: `Pieza ${piezaId}`,
  postUrn,
  publicadoEn: `${dia}T15:00:00.000Z`,
})

describe("cruzarConPiezas", () => {
  it("matches a post Conidolly published by the number of its share URN", () => {
    const cruce = cruzarConPiezas(
      excel([post("share", "71", "2026-10-03", 1200, 12)]),
      [pieza("a", "2026-10-03", "urn:li:share:71")],
      ZONA,
    )
    expect(cruce).toEqual({
      seguros: [{ piezaId: "a", impresiones: 1200, interacciones: 12 }],
      dudosos: [],
      ajenas: 0,
      faltanEnElPeriodo: 0,
    })
  })

  it("matches an ugcPost URN, and never mixes it with a share of the same number", () => {
    const cruce = cruzarConPiezas(
      excel([post("share", "72", "2026-10-07", 1), post("ugcPost", "72", "2026-10-07", 2300, 40)]),
      [pieza("a", "2026-10-07", "urn:li:ugcPost:72")],
      ZONA,
    )
    expect(cruce.seguros).toEqual([{ piezaId: "a", impresiones: 2300, interacciones: 40 }])
  })

  it("pairs a hand upload with the only free Excel post of its day", () => {
    const cruce = cruzarConPiezas(excel([post("share", "80", "2026-10-07", 500, 5)]), [pieza("m", "2026-10-07")], ZONA)
    expect(cruce.seguros).toEqual([{ piezaId: "m", impresiones: 500, interacciones: 5 }])
    expect(cruce.dudosos).toEqual([])
  })

  it("dates a hand upload by the day in Santiago, not in UTC", () => {
    // 02:00 UTC on the 8th is 23:00 of the 7th in Santiago.
    const tarde = { ...pieza("m", "2026-10-08"), publicadoEn: "2026-10-08T02:00:00Z" }
    const cruce = cruzarConPiezas(excel([post("share", "85", "2026-10-07", 400, 4)]), [tarde], ZONA)
    expect(cruce.seguros).toEqual([{ piezaId: "m", impresiones: 400, interacciones: 4 }])
    expect(cruce.dudosos).toEqual([])
  })

  it("leaves two hand uploads of the same day doubtful, each offered that day's posts", () => {
    const cruce = cruzarConPiezas(
      excel([post("share", "81", "2026-10-07", 500, 5), post("share", "82", "2026-10-07", 700, 7)]),
      [pieza("m", "2026-10-07"), pieza("n", "2026-10-07")],
      ZONA,
    )
    const opciones = [
      { clave: "share:81", fecha: "2026-10-07", impresiones: 500, interacciones: 5 },
      { clave: "share:82", fecha: "2026-10-07", impresiones: 700, interacciones: 7 },
    ]
    expect(cruce.seguros).toEqual([])
    expect(cruce.dudosos).toEqual([
      { piezaId: "m", titulo: "Pieza m", fecha: "2026-10-07", opciones },
      { piezaId: "n", titulo: "Pieza n", fecha: "2026-10-07", opciones },
    ])
    expect(cruce.ajenas).toBe(0)
  })

  it("leaves a hand upload with no post that day doubtful, offering the posts of the day beside it", () => {
    const cruce = cruzarConPiezas(excel([post("share", "83", "2026-10-08", 300, 3)]), [pieza("m", "2026-10-07")], ZONA)
    expect(cruce.dudosos).toEqual([
      {
        piezaId: "m",
        titulo: "Pieza m",
        fecha: "2026-10-07",
        opciones: [{ clave: "share:83", fecha: "2026-10-08", impresiones: 300, interacciones: 3 }],
      },
    ])
  })

  it("never offers a post already claimed by a URN", () => {
    const cruce = cruzarConPiezas(
      excel([post("share", "84", "2026-10-07")]),
      [pieza("a", "2026-10-07", "urn:li:share:84"), pieza("m", "2026-10-07")],
      ZONA,
    )
    expect(cruce.dudosos).toEqual([])
    expect(cruce.faltanEnElPeriodo).toBe(1)
  })

  it("counts the Excel posts that are not Conidolly's, unidentified rows included", () => {
    const cruce = cruzarConPiezas(
      excel(
        [post("share", "71", "2026-10-03"), post("share", "90", "2026-10-12"), post("ugcPost", "91", "2026-10-20")],
        {
          sinIdentificar: 1,
        },
      ),
      [pieza("a", "2026-10-03", "urn:li:share:71")],
      ZONA,
    )
    expect(cruce.ajenas).toBe(3)
  })

  it("counts a Conidolly post of the period missing from the file, not one outside it", () => {
    const cruce = cruzarConPiezas(
      excel([]),
      [pieza("dentro", "2026-10-15", "urn:li:share:1"), pieza("fuera", "2026-09-15", "urn:li:share:2")],
      ZONA,
    )
    expect(cruce.faltanEnElPeriodo).toBe(1)
  })
})
