// @vitest-environment node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { lineasParaWav } from "@/lib/dominio/biblioteca/detalle"
import { ideasSacadas, PALABRAS, REEMPLAZOS, SOLO_PARA_WAV } from "@/lib/dominio/biblioteca/palabras"

const SECCION = join(__dirname, "..", "..", "app", "(app)", "biblioteca")

function archivos(carpeta: string): string[] {
  if (!existsSync(carpeta)) return []
  return readdirSync(carpeta).flatMap((nombre) => {
    const ruta = join(carpeta, nombre)
    return statSync(ruta).isDirectory() ? archivos(ruta) : /\.tsx?$/.test(nombre) ? [ruta] : []
  })
}

const VIEJAS = "Papel|Afirmaciones|Tipos de afirmación|Puntaje|Evidencia"
/** Every "", '' or `` string literal, anywhere in it; a template's `${...}` holes are code, so they are taken out. */
const CADENA = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g
/** Anywhere in JSX text: between a tag's `>` and the next `<`, once the `{...}` expressions are taken out. */
const TEXTO_JSX = />([^<>]*)</g
const EXPRESION = /\{[^{}]*\}/g
const HUECO = /\$\{[^{}]*\}/g
const EN_TEXTO = new RegExp(`\\b(${VIEJAS})\\b`)

function conPalabrasViejas(codigo: string): boolean {
  if ([...codigo.matchAll(CADENA)].some(([cadena]) => EN_TEXTO.test(cadena.replace(HUECO, " ")))) return true
  return [...codigo.matchAll(TEXTO_JSX)].some(([, texto]) => EN_TEXTO.test((texto ?? "").replace(EXPRESION, " ")))
}

describe("Coni's words (4h)", () => {
  it("replaces the technical words with hers", () => {
    expect(REEMPLAZOS).toEqual([
      { antes: "Papel", ahora: "¿Quién es para ti?" },
      { antes: "Afirmaciones", ahora: "Ideas sacadas" },
      { antes: "Tipos de afirmación", ahora: "Qué tipo de idea es" },
    ])
    expect(PALABRAS.detalle).toBe("Detalle para WAV")
    expect(SOLO_PARA_WAV).toEqual(["Puntaje", "Evidencia"])
  })

  it("counts ideas in words", () => {
    expect(ideasSacadas(1)).toBe("1 idea sacada")
    expect(ideasSacadas(12)).toBe("12 ideas sacadas")
  })

  it("finds the old words in strings, template literals and JSX text, not in names", () => {
    expect(conPalabrasViejas(`const a = "Papel del autor"`)).toBe(true)
    expect(conPalabrasViejas("const a = 'Afirmaciones'")).toBe(true)
    expect(conPalabrasViejas("const a = `Puntaje del material`")).toBe(true)
    expect(conPalabrasViejas(`const a = "Ver el Papel del autor"`)).toBe(true)
    expect(conPalabrasViejas("const a = 'Sin Afirmaciones'")).toBe(true)
    expect(conPalabrasViejas("const a = `\u0024{n} de Puntaje`")).toBe(true)
    expect(conPalabrasViejas(`aria-label="Abrir la Evidencia"`)).toBe(true)
    expect(conPalabrasViejas(`const a = "Papeles"`)).toBe(false)
    expect(conPalabrasViejas("<dt>Tipos de afirmación</dt>")).toBe(true)
    expect(conPalabrasViejas("<p>\n  Ver la Evidencia\n</p>")).toBe(true)
    expect(conPalabrasViejas("<span className={c}>{n} de Puntaje</span>")).toBe(true)
    expect(conPalabrasViejas("import { EVIDENCIA } from './etiquetas'")).toBe(false)
    expect(conPalabrasViejas("type TipoDeEvidencia = string")).toBe(false)
    expect(conPalabrasViejas("<p>{ideasSacadas(n)}</p>")).toBe(false)
  })

  // No exception is needed inside the section: "Papel:" and "Evidencia:" live in lib/dominio/biblioteca/detalle.ts,
  // which only feeds "Detalle para WAV" and is outside the folder scanned here.
  it("keeps the old words out of the text of every Biblioteca screen", () => {
    expect(archivos(SECCION).filter((ruta) => conPalabrasViejas(readFileSync(ruta, "utf-8")))).toEqual([])
  })
})

describe("lineasParaWav (D10)", () => {
  const material = {
    id: "m-1",
    autor_id: "a-1",
    rol: "referente",
    motivo_fallo: null,
    costo_estimado_usd: null,
  }

  it("folds the role code, the evidence most first, and the ids", () => {
    expect(lineasParaWav(material, { opinion: 2, estudio: 3 })).toEqual([
      "Papel: referente",
      "Evidencia: Estudio 3 · Opinión 2",
      "Material: m-1",
      "Autor: a-1",
    ])
  })

  it("adds the reason and the estimated cost when there are, with nothing about a confirmation (batch 6)", () => {
    expect(lineasParaWav({ ...material, motivo_fallo: "tope_mensual", costo_estimado_usd: 1.2 }, {})).toEqual([
      "Papel: referente",
      "Motivo: tope_mensual",
      "Costo estimado: US$ 1,20",
      "Material: m-1",
      "Autor: a-1",
    ])
    expect(lineasParaWav({ ...material, costo_estimado_usd: 0.5 }, {})).toContain("Costo estimado: US$ 0,50")
  })
})
