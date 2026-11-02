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

  it("keeps the old words out of the text of every Biblioteca screen", () => {
    const viejas = /["'>]\s*(Papel|Afirmaciones|Tipos de afirmación|Puntaje|Evidencia)\b/
    expect(archivos(SECCION).filter((ruta) => viejas.test(readFileSync(ruta, "utf-8")))).toEqual([])
  })
})

describe("lineasParaWav (D10)", () => {
  const material = {
    id: "m-1",
    autor_id: "a-1",
    rol: "referente",
    motivo_fallo: null,
    costo_estimado_usd: null,
    costo_confirmado_en: null,
  }

  it("folds the role code, the evidence most first, and the ids", () => {
    expect(lineasParaWav(material, { opinion: 2, estudio: 3 })).toEqual([
      "Papel: referente",
      "Evidencia: Estudio 3 · Opinión 2",
      "Material: m-1",
      "Autor: a-1",
    ])
  })

  it("adds the reason and the estimated cost when there are", () => {
    expect(
      lineasParaWav(
        { ...material, motivo_fallo: "tope_mensual", costo_estimado_usd: 1.2, costo_confirmado_en: null },
        {},
      ),
    ).toEqual([
      "Papel: referente",
      "Motivo: tope_mensual",
      "Costo estimado: US$ 1,20 (sin confirmar)",
      "Material: m-1",
      "Autor: a-1",
    ])
    expect(
      lineasParaWav({ ...material, costo_estimado_usd: 0.5, costo_confirmado_en: "2026-11-02T12:00:00Z" }, {}),
    ).toContain("Costo estimado: US$ 0,50 (confirmado)")
  })
})
