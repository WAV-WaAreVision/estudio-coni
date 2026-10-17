import { describe, expect, it } from "vitest"
import { resaltarFrases } from "@/lib/diseno/resaltado"

const GUION = "[warm] Muchas apps no pasaron por una evaluación. Muchas apps, otra vez. [pause] Soy Coni."

describe("resaltarFrases", () => {
  it("marks a phrase at its first occurrence and keeps every other character as it was", () => {
    const { trozos, resaltadas } = resaltarFrases(GUION, ["Muchas apps"])
    expect(trozos).toEqual([
      { tipo: "marca", valor: "[warm]" },
      { tipo: "texto", valor: " " },
      { tipo: "frase", valor: "Muchas apps", indice: 0 },
      { tipo: "texto", valor: " no pasaron por una evaluación. Muchas apps, otra vez. " },
      { tipo: "marca", valor: "[pause]" },
      { tipo: "texto", valor: " Soy Coni." },
    ])
    expect(trozos.map((trozo) => trozo.valor).join("")).toBe(GUION)
    expect([...resaltadas]).toEqual([0])
  })

  it("leaves a phrase that is not in the script unmarked", () => {
    const { trozos, resaltadas } = resaltarFrases(GUION, ["la mayoría"])
    expect(trozos.some((trozo) => trozo.tipo === "frase")).toBe(false)
    expect(resaltadas.size).toBe(0)
  })

  it("leaves a phrase whose first occurrence crosses a tone mark unmarked", () => {
    const { resaltadas } = resaltarFrases(GUION, ["otra vez. [pause] Soy"])
    expect(resaltadas.size).toBe(0)
  })

  it("marks several phrases in their order, skips findings without one and one that overlaps an earlier mark", () => {
    const { trozos, resaltadas } = resaltarFrases(GUION, [null, "Soy Coni.", "Muchas apps no", "apps no pasaron"])
    expect(trozos.filter((trozo) => trozo.tipo === "frase").map((trozo) => trozo.valor)).toEqual([
      "Muchas apps no",
      "Soy Coni.",
    ])
    expect([...resaltadas].sort()).toEqual([1, 2])
  })
})
