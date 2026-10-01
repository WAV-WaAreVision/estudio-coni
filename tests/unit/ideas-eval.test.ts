// @vitest-environment node
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

interface Idea {
  numero: number
  pilar: string
  alertas: { tipo: string; texto: string }[]
}

const ideas: Idea[] = JSON.parse(readFileSync(new URL("../fixtures/ideas-eval.json", import.meta.url), "utf-8"))

describe("ideas-eval.json", () => {
  it("has ten ideas, two per pillar", () => {
    expect(ideas).toHaveLength(10)
    const porPilar = Object.groupBy(ideas, (idea) => idea.pilar)
    expect(Object.keys(porPilar).sort()).toEqual(["autoestima", "bienestar", "deseo", "limites", "pareja"])
    for (const grupo of Object.values(porPilar)) expect(grupo).toHaveLength(2)
  })

  it("has at least three ideas to verify and two with help lines, so both evals have something to catch", () => {
    const con = (tipo: string) => ideas.filter((idea) => idea.alertas.some((alerta) => alerta.tipo === tipo))
    expect(con("verificar dato").length).toBeGreaterThanOrEqual(3)
    expect(con("líneas de ayuda").length).toBeGreaterThanOrEqual(2)
  })

  it("keeps one alert per type with its text", () => {
    for (const idea of ideas) {
      for (const alerta of idea.alertas) {
        expect(alerta.tipo).not.toContain("·")
        expect(alerta.texto.length).toBeGreaterThan(0)
      }
    }
  })
})
