import { describe, expect, it } from "vitest"
import { aCsv, estimarClasificacion, leerCsv, POR_TANDA, validarFilas } from "@/lib/pilares/reclasificar"

const FILAS = [
  {
    id: "m1",
    tipo: "material" as const,
    antes: "pareja",
    propuesta: "ia-salud-mental",
    razon: 'Habla de chatbots, "apps" y uso real',
  },
  { id: "t1", tipo: "tema" as const, antes: "", propuesta: "general", razon: "No calza,\nen ninguno" },
]
const PERMITIDAS = [
  "ia-salud-mental",
  "practica-clinica",
  "etica-regulacion",
  "acceso-salud-publica",
  "caso-coni",
  "general",
]

describe("CSV de reclasificación", () => {
  it("writes the header and quotes every field", () => {
    expect(aCsv(FILAS).split("\n")[0]).toBe('"id","tipo","antes","propuesta","razon"')
  })

  it("reads back what it wrote, quotes and line breaks included", () => {
    expect(leerCsv(aCsv(FILAS))).toEqual(FILAS)
  })

  it("reads a row WAV edited in a spreadsheet without quotes", () => {
    const csv = "id,tipo,antes,propuesta,razon\nm1,material,pareja,etica-regulacion,cambiado por WAV\n"
    expect(leerCsv(csv)[0]?.propuesta).toBe("etica-regulacion")
  })

  it("reads a file a spreadsheet saved with a UTF-8 byte order mark", () => {
    expect(leerCsv(`\uFEFF${aCsv(FILAS)}`)).toEqual(FILAS)
  })

  it("names the line of a row it cannot read", () => {
    expect(() => leerCsv("id,tipo,antes,propuesta,razon\nm1,cosa,pareja,general,x\n")).toThrow(
      "Línea 2: tipo desconocido «cosa».",
    )
  })
})

describe("validarFilas", () => {
  it("accepts active pillars and general", () => {
    expect(() => validarFilas(FILAS, PERMITIDAS)).not.toThrow()
  })

  it("refuses a retired pillar or an unknown slug, naming the ids", () => {
    expect(() => validarFilas([{ ...FILAS[0], propuesta: "deseo" }], PERMITIDAS)).toThrow(
      "Propuestas que no son un pilar activo ni general: m1 (deseo).",
    )
  })

  it("refuses the same id twice", () => {
    expect(() => validarFilas([FILAS[0], FILAS[0]], PERMITIDAS)).toThrow("Ids repetidos: m1.")
  })
})

describe("estimarClasificacion", () => {
  it("counts batches and a positive cost that grows with the items", () => {
    const pocos = estimarClasificacion({
      elementos: [{ id: "a", tipo: "tema", texto: "x".repeat(400) }],
      sistema: "s".repeat(4000),
    })
    const muchos = estimarClasificacion({
      elementos: Array.from({ length: POR_TANDA + 1 }, (_, i) => ({
        id: `${i}`,
        tipo: "tema" as const,
        texto: "x".repeat(400),
      })),
      sistema: "s".repeat(4000),
    })
    expect(pocos.tandas).toBe(1)
    expect(muchos.tandas).toBe(2)
    expect(muchos.usd).toBeGreaterThan(pocos.usd)
    expect(pocos.usd).toBeGreaterThan(0)
  })
})
