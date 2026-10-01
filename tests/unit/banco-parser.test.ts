// @vitest-environment node
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { parsearBanco } from "@/lib/ideas/banco"

const MUESTRA = readFileSync(join(__dirname, "../fixtures/banco-muestra.md"), "utf-8")

const ENCABEZADO =
  "| # | Gancho | Tema | Formato | Fuerza | Revisar | Fuentes | Estado |\n|---|---|---|---|---|---|---|---|\n"
const bajoPareja = (...filas: string[]) => `## Pareja y conversación\n\n${ENCABEZADO}${filas.join("\n")}\n`

describe("parsearBanco", () => {
  it("reads number, pillar, hook, topic, format, strength and state of every row of the pillar tables", () => {
    const ideas = parsearBanco(MUESTRA)

    expect(ideas.map((i) => [i.numero, i.pilar, i.fuerza, i.estado])).toEqual([
      [901, "pareja", "alta", "idea"],
      [902, "pareja", "media", "idea"],
      [903, "deseo", "baja", "usada"],
    ])
    expect(ideas[0]).toMatchObject({
      gancho: "Decías 'qué bien' y querías decir 'quédate conmigo'.",
      tema: "Hablar claro en vez de insinuar.",
      formato: "Ejercicio de la semana",
    })
    expect(ideas[2]?.formato).toBe("otro: una palabra que cambiar")
  })

  it("splits the review cell into one alert per type, keeping the type exactly as the bank writes it", () => {
    const [, segunda, tercera] = parsearBanco(MUESTRA)

    expect(segunda?.alertas).toEqual([
      { tipo: "líneas de ayuda", texto: "La fuente cita proxémica sin estudio." },
      { tipo: "verificar dato", texto: "La fuente cita proxémica sin estudio. Otra cifra sin respaldo." },
      { tipo: "nota", texto: "Matizar que no aplica si hay control." },
    ])
    expect(tercera?.alertas).toEqual([{ tipo: "no es terapia", texto: "Sin diagnósticos." }])
  })

  it("leaves an empty review cell as no alerts", () => {
    expect(parsearBanco(MUESTRA)[0]?.alertas).toEqual([])
  })

  it("lists each source once, in the order it first appears", () => {
    const [primera, segunda] = parsearBanco(MUESTRA)

    expect(primera?.fuentes).toEqual(["cuenta_uno 2025-07-31", "cuenta_uno 2024-05-15"])
    expect(segunda?.fuentes).toEqual(["cuenta_uno 2023-01-02", "cuenta_dos 2024-02-03"])
  })

  it("ignores the tables that are not pillars", () => {
    expect(parsearBanco(MUESTRA)).toHaveLength(3)
  })

  it("maps the long pillar names of the bank to the pillars of the app", () => {
    const tabla = (titulo: string, numero: number) =>
      `## ${titulo}\n\n${ENCABEZADO}| ${numero} | G | T | F | alta |  | a 2025-01-01 | idea |\n`
    const ideas = parsearBanco(
      [
        tabla('Autoestima y "ser tu propia diosa"', 1),
        tabla("Género y límites", 2),
        tabla("Bienestar emocional", 3),
      ].join("\n"),
    )

    expect(ideas.map((i) => i.pilar)).toEqual(["autoestima", "limites", "bienestar"])
  })

  it("refuses a repeated number, because the number is what makes the import repeatable", () => {
    const fila = "| 001 | G | T | F | alta |  | a 2025-01-01 | idea |"
    expect(() => parsearBanco(bajoPareja(fila, fila))).toThrow(/001/)
  })

  it("refuses a row with a strength, state or alert type it does not know", () => {
    expect(() => parsearBanco(bajoPareja("| 001 | G | T | F | enorme |  | a | idea |"))).toThrow(/fuerza/i)
    expect(() => parsearBanco(bajoPareja("| 001 | G | T | F | alta |  | a | pendiente |"))).toThrow(/estado/i)
    expect(() => parsearBanco(bajoPareja("| 001 | G | T | F | alta | **peligro:** x | a | idea |"))).toThrow(/peligro/)
  })

  it("refuses a row that does not have the eight columns", () => {
    expect(() => parsearBanco(bajoPareja("| 001 | G | T | alta | idea |"))).toThrow(/columnas/i)
  })

  it("refuses a bank with no idea in it", () => {
    expect(() => parsearBanco("# Banco\n\nnada")).toThrow(/ninguna idea/i)
  })
})
