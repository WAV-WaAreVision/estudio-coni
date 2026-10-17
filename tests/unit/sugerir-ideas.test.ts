import { describe, expect, it } from "vitest"
import { type IdeaDelBanco, sugerirIdeas } from "@/lib/dominio/ideas"

let numero = 0
function idea(pilar: string, fuerza: IdeaDelBanco["fuerza"] = "media"): IdeaDelBanco {
  numero += 1
  return { id: `idea-${numero}`, pilar, fuerza, numero }
}

describe("sugerirIdeas", () => {
  it("covers every pillar before repeating one", () => {
    const banco = [
      idea("deseo"),
      idea("deseo"),
      idea("deseo"),
      idea("pareja"),
      idea("autoestima"),
      idea("limites"),
      idea("bienestar"),
    ]

    const elegidas = sugerirIdeas({ banco, recientes: [], cuantas: 5 })

    expect(new Set(elegidas.map((e) => e.pilar)).size).toBe(5)
  })

  it("puts the pillars that did not come out lately first", () => {
    const banco = [idea("deseo"), idea("pareja"), idea("limites")]

    const elegidas = sugerirIdeas({ banco, recientes: ["deseo", "deseo", "pareja"], cuantas: 3 })

    expect(elegidas.map((e) => e.pilar)).toEqual(["limites", "pareja", "deseo"])
  })

  it("prefers the stronger idea inside a pillar, then the lower number", () => {
    const debil = idea("deseo", "baja")
    const media = idea("deseo", "media")
    const fuerteTarde = idea("deseo", "alta")
    const fuerteTemprana = { ...idea("deseo", "alta"), numero: 1 }

    const elegidas = sugerirIdeas({ banco: [debil, media, fuerteTarde, fuerteTemprana], recientes: [], cuantas: 4 })

    expect(elegidas.map((e) => e.id)).toEqual([fuerteTemprana.id, fuerteTarde.id, media.id, debil.id])
  })

  it("returns what there is when the bank has fewer ideas than asked", () => {
    expect(sugerirIdeas({ banco: [idea("deseo")], recientes: [], cuantas: 5 })).toHaveLength(1)
    expect(sugerirIdeas({ banco: [], recientes: [], cuantas: 5 })).toEqual([])
  })

  it("gives the same answer for the same bank", () => {
    const banco = [idea("deseo"), idea("pareja"), idea("pareja"), idea("limites")]

    expect(sugerirIdeas({ banco, recientes: [], cuantas: 3 })).toEqual(
      sugerirIdeas({ banco, recientes: [], cuantas: 3 }),
    )
  })

  it("offers first the ideas she added to the week from the bank, in the order of the bank", () => {
    const comun = idea("pareja", "alta")
    const fijadaTarde = { ...idea("bienestar", "baja"), fijada: true }
    const fijadaTemprana = { ...idea("deseo", "media"), fijada: true, numero: 2 }

    const elegidas = sugerirIdeas({ banco: [comun, fijadaTarde, fijadaTemprana], recientes: [], cuantas: 3 })

    expect(elegidas.map((e) => e.id)).toEqual([fijadaTemprana.id, fijadaTarde.id, comun.id])
  })

  it("still fills the rest with the usual rotation when fewer ideas are added than asked", () => {
    const fijada = { ...idea("deseo", "baja"), fijada: true }
    const banco = [fijada, idea("pareja"), idea("limites"), idea("bienestar")]

    const elegidas = sugerirIdeas({ banco, recientes: [], cuantas: 4 })

    expect(elegidas[0]?.id).toBe(fijada.id)
    expect(new Set(elegidas.map((e) => e.pilar)).size).toBe(4)
  })
})
