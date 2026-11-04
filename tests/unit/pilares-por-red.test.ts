// @vitest-environment node
import { describe, expect, it } from "vitest"
import {
  aCsvPorRed,
  aMarkdownParaConi,
  estimarPropuestaPorRed,
  type FilaPorRed,
  filasDelLote,
  filasDePropuesta,
  LOTE_PILARES_POR_RED,
  leerCsvPorRed,
} from "@/lib/pilares/por-red"
import { PILARES_DE_PRUEBA } from "../fixtures/pilares"

const TEMA = "11111111-1111-4111-8111-111111111111"
const IDEA = "22222222-2222-4222-8222-222222222222"

const tema = (cambios: Partial<FilaPorRed> = {}): FilaPorRed => ({
  tipo: "tema",
  id: TEMA,
  nombre: 'Carga mental, "invisible" | en casa',
  linkedin: "bienestar-e-impacto",
  instagram: "",
  secundarios: "diagnostico-doble",
  capa_tdah: "si",
  pilar_nuevo: "",
  venia_de: "IA y salud mental",
  razon: "Toca el bienestar,\ny el diagnóstico.",
  ...cambios,
})

const idea = (cambios: Partial<FilaPorRed> = {}): FilaPorRed => ({
  tipo: "idea",
  id: IDEA,
  nombre: "Uso un avatar.",
  linkedin: "",
  instagram: "",
  secundarios: "",
  capa_tdah: "",
  pilar_nuevo: "psicologia-en-la-mesa",
  venia_de: "Caso Coni",
  razon: "Lo construye ella.",
  ...cambios,
})

describe("la propuesta de pilares por red", () => {
  it("names its lot", () => {
    expect(LOTE_PILARES_POR_RED).toBe("pilares-por-red-2026-11")
  })

  it("turns Claude's proposal into rows: topics with their networks and layer, ideas with their new pillar", () => {
    const filas = filasDePropuesta(
      [{ id: TEMA, nombre: "Carga mental", descripcion: null, ideas: [], veniaDe: "IA y salud mental" }],
      [{ id: IDEA, gancho: "Uso un avatar.", tema: "", veniaDe: "Caso Coni" }],
      {
        temas: [
          {
            id: TEMA,
            linkedin: "bienestar-e-impacto",
            instagram: null,
            secundarios: ["diagnostico-doble", "mujeres-lideres"],
            capa: true,
            razon: "Calza.",
          },
        ],
        ideas: [{ id: IDEA, pilar: null, razon: "Claude no propuso un pilar." }],
      },
    )
    expect(filas).toEqual([
      tema({
        nombre: "Carga mental",
        secundarios: "diagnostico-doble;mujeres-lideres",
        razon: "Calza.",
      }),
      idea({ pilar_nuevo: "", razon: "Claude no propuso un pilar." }),
    ])
  })

  it("writes and reads the CSV back, quotes, commas, pipes and line breaks included", () => {
    const filas = [tema(), idea()]
    const csv = aCsvPorRed(filas)
    expect(csv.split("\n")[0]).toBe(
      '"tipo","id","nombre","linkedin","instagram","secundarios","capa_tdah","pilar_nuevo","venia_de","razon"',
    )
    expect(leerCsvPorRed(`\uFEFF${csv}`)).toEqual(filas)
  })

  it("refuses a CSV with another header or an unknown kind of row", () => {
    expect(() => leerCsvPorRed("id,tipo\n")).toThrow("La primera línea tiene que ser:")
    const malo = aCsvPorRed([tema()]).replace('"tema"', '"material"')
    expect(() => leerCsvPorRed(malo)).toThrow("Fila 2: tipo desconocido «material».")
  })

  it("hints at the separator when the header does not match, as a spreadsheet saved with semicolons does", () => {
    const conPuntoYComa = aCsvPorRed([tema()]).replaceAll('","', '";"')
    expect(() => leerCsvPorRed(conPuntoYComa)).toThrow(
      "¿Lo guardaste con punto y coma? Expórtalo como CSV UTF-8 separado por comas.",
    )
  })

  it("names the spreadsheet row of every broken line at once: unknown kind, missing id, values beyond the columns", () => {
    const csv = aCsvPorRed([tema(), idea({ id: "" }), tema({ tipo: "material" as FilaPorRed["tipo"] })])
    const conExtra = csv.replace(/\n$/, ',"sobra"\n')
    let mensaje = ""
    try {
      leerCsvPorRed(conExtra)
    } catch (error) {
      mensaje = error instanceof Error ? error.message : String(error)
    }
    expect(mensaje).toContain("Fila 3: falta el id.")
    expect(mensaje).toContain("Fila 4: tipo desconocido «material».")
    expect(mensaje).toContain("Fila 4: tiene 11 valores y el CSV tiene 10 columnas.")
    expect(mensaje).not.toContain("Fila 2")
  })

  it("lists for Coni her columns plus «Venía de», with short names and no slugs", () => {
    const md = aMarkdownParaConi([tema(), idea()], PILARES_DE_PRUEBA)
    expect(md).toContain("| Tema | Principal LinkedIn | Principal Instagram | Secundarios | Capa TDAH | Venía de |")
    expect(md).toContain(
      '| Carga mental, "invisible" \\| en casa | Bienestar e impacto | Sin pilar | Diagnóstico doble | Sí | IA y salud mental |',
    )
    expect(md).toContain("| Idea | Pilar nuevo | Venía de |")
    expect(md).toContain("| Uso un avatar. | Psicología en la mesa | Caso Coni |")
    expect(md).not.toContain("bienestar-e-impacto")
    expect(md).not.toContain("—")
  })

  it("keeps em dashes out of Coni's list even when a name or a hook carries one", () => {
    const md = aMarkdownParaConi(
      [
        tema({ nombre: "Carga mental — en casa", venia_de: "IA – salud" }),
        idea({ nombre: "Uso un avatar — y lo digo." }),
      ],
      PILARES_DE_PRUEBA,
    )
    expect(md).toContain("| Carga mental, en casa |")
    expect(md).toContain("| IA, salud |")
    expect(md).toContain("| Uso un avatar, y lo digo. |")
    expect(md).not.toMatch(/[—–]/)
  })

  it("turns reviewed rows into the lot: main pillars alta, secondaries media, the layer bare, ideas moved", () => {
    expect(filasDelLote([tema({ instagram: "mi-nueva-partida" }), idea()], PILARES_DE_PRUEBA)).toEqual({
      temas: [
        {
          temaId: TEMA,
          pilares: [
            { pilar: "bienestar-e-impacto", fuerza: "alta" },
            { pilar: "mi-nueva-partida", fuerza: "alta" },
            { pilar: "diagnostico-doble", fuerza: "media" },
            { pilar: "capa-tdah", fuerza: null },
          ],
        },
      ],
      ideas: [{ ideaId: IDEA, pilar: "psicologia-en-la-mesa" }],
    })
  })

  it("keeps a topic with no pillar in either network and no layer as a topic with no rows", () => {
    expect(filasDelLote([tema({ linkedin: "", secundarios: "", capa_tdah: "no" })], PILARES_DE_PRUEBA).temas).toEqual([
      { temaId: TEMA, pilares: [] },
    ])
  })

  it("reads Capa TDAH however it was typed: si, sí, SI, Sí, no, NO", () => {
    const capas = ["si", "sí", "SI", "Sí", "no", "NO"].map(
      (valor) =>
        filasDelLote([tema({ linkedin: "", secundarios: "", capa_tdah: valor })], PILARES_DE_PRUEBA).temas[0]?.pilares
          .length,
    )
    expect(capas).toEqual([1, 1, 1, 1, 0, 0])
  })

  it("points at the spreadsheet row of an id that is not one and of a secondary written twice", () => {
    let mensaje = ""
    try {
      filasDelLote(
        [
          tema({ secundarios: "diagnostico-doble;diagnostico-doble" }),
          idea({ id: "no-es-un-id" }),
          tema({ id: TEMA.toUpperCase(), nombre: "El mismo tema en mayúsculas" }),
        ],
        PILARES_DE_PRUEBA,
      )
    } catch (error) {
      mensaje = error instanceof Error ? error.message : String(error)
    }
    expect(mensaje).toContain(`Fila 2 (tema ${TEMA}): «diagnostico-doble» está repetido en Secundarios.`)
    expect(mensaje).toContain("Fila 3 (idea no-es-un-id): el id no es válido.")
    expect(mensaje).toContain(`Fila 4 (tema ${TEMA.toUpperCase()}): el id está repetido.`)
  })

  it("lists every mistake of the reviewed rows at once", () => {
    const filas = [
      tema({ linkedin: "mi-nueva-partida", secundarios: "inteligencia-emocional;no-existe", capa_tdah: "quizas" }),
      tema({ nombre: "Repetido", linkedin: "", secundarios: "" }),
      idea({ pilar_nuevo: "capa-tdah" }),
    ]
    let mensaje = ""
    try {
      filasDelLote(filas, PILARES_DE_PRUEBA)
    } catch (error) {
      mensaje = error instanceof Error ? error.message : String(error)
    }
    expect(mensaje).toContain("«mi-nueva-partida» no es un pilar de LinkedIn")
    expect(mensaje).toContain("«inteligencia-emocional» va en Secundarios pero el tema no tiene pilar en Instagram")
    expect(mensaje).toContain("«no-existe» no es un pilar activo de una red")
    expect(mensaje).toContain("Capa TDAH tiene que ser si o no")
    expect(mensaje).toContain("el id está repetido")
    expect(mensaje).toContain("«capa-tdah» no es un pilar activo de una red")
  })

  it("estimates the cost of the call from the text it sends", () => {
    const usd = estimarPropuestaPorRed({
      pilares: PILARES_DE_PRUEBA,
      temas: [{ id: TEMA, nombre: "Carga mental", descripcion: null, ideas: ["Una idea."] }],
      ideas: [{ id: IDEA, gancho: "Uso un avatar.", tema: "" }],
    })
    expect(usd).toBeGreaterThan(0)
    expect(usd).toBeLessThan(0.05)
  })
})
