import { describe, expect, it } from "vitest"
import { type HojasDelExcel, leerExcelDeLinkedin, leerFecha } from "@/lib/metricas/excel-linkedin/leer"

type Fila = [string, string, string]
const VACIA: Fila = ["", "", ""]
const ENCABEZADO = [
  "URL de la publicación",
  "Fecha de publicación",
  "Interacciones",
  "",
  "URL de la publicación",
  "Fecha de publicación",
  "Impresiones",
]
const url = (tipo: string, numero: string, titulo = "la-terapia-no-es-un-chat") =>
  `https://www.linkedin.com/posts/constanza-del-rosario_${titulo}-${tipo}-${numero}-AbCd`

function hojas(
  opciones: { periodo?: string; interacciones?: Fila[]; impresiones?: Fila[]; seguidores?: string[] | null } = {},
): HojasDelExcel {
  const { interacciones = [], impresiones = [] } = opciones
  const largo = Math.max(interacciones.length, impresiones.length)
  const filas = Array.from({ length: largo }, (_, i) => [
    ...(interacciones[i] ?? VACIA),
    "",
    ...(impresiones[i] ?? VACIA),
  ])
  const resultado = new Map<string, string[][]>([
    [
      "DESCUBRIMIENTO",
      [
        ["Rendimiento general", opciones.periodo ?? "1/10/2026 - 30/10/2026"],
        ["Impresiones", "5400"],
      ],
    ],
    ["INTERACCIÓN", [["Fecha", "Impresiones", "Interacciones"]]],
    [
      "PUBLICACIONES PRINCIPALES",
      [["Esta lista puede incluir 50 publicaciones como máximo"], [], ENCABEZADO, ...filas],
    ],
  ])
  if (opciones.seguidores !== null) {
    resultado.set("SEGUIDORES", [opciones.seguidores ?? ["Total de seguidores el 30/10/2026", "830"]])
  }
  return resultado
}

describe("leerFecha", () => {
  it("reads D/M/AAAA without leading zeros and refuses a day that does not exist", () => {
    expect(leerFecha("9/11/2026")).toBe("2026-11-09")
    expect(leerFecha("31/12/2026")).toBe("2026-12-31")
    expect(leerFecha("31/2/2026")).toBeNull()
    expect(leerFecha("2026-11-09")).toBeNull()
  })
})

describe("leerExcelDeLinkedin", () => {
  it("joins the two rankings by URL and reads the period and the followers", () => {
    const lectura = leerExcelDeLinkedin(
      hojas({
        interacciones: [
          [url("share", "7380000000000000001"), "3/10/2026", "12"],
          [url("ugcPost", "7380000000000000002"), "7/10/2026", "40"],
        ],
        impresiones: [
          [url("ugcPost", "7380000000000000002"), "7/10/2026", "2.300"],
          [url("share", "7380000000000000001"), "3/10/2026", "1200"],
        ],
      }),
    )

    expect(lectura).toEqual({
      ok: true,
      excel: {
        periodo: { desde: "2026-10-01", hasta: "2026-10-30" },
        publicaciones: [
          { tipo: "share", numero: "7380000000000000001", fecha: "2026-10-03", impresiones: 1200, interacciones: 12 },
          { tipo: "ugcPost", numero: "7380000000000000002", fecha: "2026-10-07", impresiones: 2300, interacciones: 40 },
        ],
        seguidores: 830,
        llegoAlTope: false,
        sinIdentificar: 0,
      },
    })
  })

  it("keeps the other figure null for a post that is in one ranking only", () => {
    const lectura = leerExcelDeLinkedin(hojas({ impresiones: [[url("share", "1"), "3/10/2026", "90"]] }))
    expect(lectura.ok && lectura.excel.publicaciones).toEqual([
      { tipo: "share", numero: "1", fecha: "2026-10-03", impresiones: 90, interacciones: null },
    ])
  })

  it("finds the post in a percent-encoded URL", () => {
    const lectura = leerExcelDeLinkedin(
      hojas({ interacciones: [[url("share", "55", "qu%C3%A9-pasa-cuando-te-dicen"), "3/10/2026", "4"]] }),
    )
    expect(lectura.ok && lectura.excel.publicaciones.map((post) => post.numero)).toEqual(["55"])
  })

  it("counts a URL that names no share or ugcPost apart, without failing", () => {
    const lectura = leerExcelDeLinkedin(
      hojas({ interacciones: [["https://www.linkedin.com/posts/alguien_algo-activity-99-XyZ", "3/10/2026", "4"]] }),
    )
    expect(lectura.ok && [lectura.excel.publicaciones, lectura.excel.sinIdentificar]).toEqual([[], 1])
  })

  it("says the list reached LinkedIn's cap of 50", () => {
    const llenas = Array.from({ length: 50 }, (_, i): Fila => [url("share", String(i + 1)), "3/10/2026", "1"])
    const lectura = leerExcelDeLinkedin(hojas({ impresiones: llenas }))
    expect(lectura.ok && lectura.excel.llegoAlTope).toBe(true)
  })

  it("leaves the followers null when their sheet is missing", () => {
    const lectura = leerExcelDeLinkedin(hojas({ seguidores: null }))
    expect(lectura.ok && lectura.excel.seguidores).toBeNull()
  })

  it("refuses the same export with LinkedIn in English", () => {
    const enIngles = new Map([
      ["DISCOVERY", [["Overall performance", "10/1/2026 - 10/30/2026"]]],
      ["TOP POSTS", [["Post URL"]]],
    ])
    expect(leerExcelDeLinkedin(enIngles)).toEqual({ ok: false, error: "otro_idioma" })
  })

  it("refuses a workbook without the posts sheet", () => {
    const sinPublicaciones = new Map(hojas())
    sinPublicaciones.delete("PUBLICACIONES PRINCIPALES")
    expect(leerExcelDeLinkedin(sinPublicaciones)).toEqual({ ok: false, error: "no_es_el_excel" })
  })

  it("refuses a period it cannot read", () => {
    expect(leerExcelDeLinkedin(hojas({ periodo: "último mes" }))).toEqual({ ok: false, error: "periodo_ilegible" })
  })
})
