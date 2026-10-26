import { describe, expect, it } from "vitest"
import { nombreDePilar } from "@/lib/dominio/pilares"
import { buscarIdeas, type IdeaDeBanco } from "@/lib/ideas/mazo"
import { PILARES_DE_PRUEBA } from "../fixtures/pilares"

function idea(parcial: Partial<IdeaDeBanco> & { id: string }): IdeaDeBanco {
  return {
    numero: 1,
    pilar: "pareja",
    gancho: "Un gancho",
    tema: "Un tema",
    formato: "Mito o realidad",
    fuerza: "media",
    alertas: [],
    estado: "idea",
    fijada: false,
    nueva: false,
    porQue: null,
    ...parcial,
    nombrePilar: nombreDePilar(PILARES_DE_PRUEBA, parcial.pilar ?? "pareja"),
    nombreCortoPilar: "Pareja",
  }
}

const BANCO: IdeaDeBanco[] = [
  idea({ id: "a", numero: 1, gancho: "El deseo no se apaga: se esconde.", pilar: "deseo", fuerza: "alta" }),
  idea({
    id: "b",
    numero: 2,
    gancho: "¿Por qué sientes culpa al descansar?",
    pilar: "autoestima",
    fuerza: "media",
    alertas: [{ tipo: "verificar dato", texto: "Cita una cifra." }],
  }),
  idea({
    id: "c",
    numero: 3,
    gancho: "Los celos no son amor.",
    tema: "Celos y control",
    pilar: "pareja",
    fuerza: "alta",
  }),
  idea({ id: "d", numero: 4, gancho: "Ya la usé.", pilar: "pareja", estado: "usada" }),
]

const sinFiltro = { texto: "", pilar: null, soloFuerzaAlta: false, soloSinAlertas: false, soloSinUsar: false }

describe("buscarIdeas", () => {
  it("returns everything in the order of the bank when nothing is filtered", () => {
    expect(buscarIdeas(BANCO, sinFiltro).map((i) => i.id)).toEqual(["a", "b", "c", "d"])
  })

  it("finds a word in the hook or in the topic, ignoring case and accents", () => {
    expect(buscarIdeas(BANCO, { ...sinFiltro, texto: "CULPA" }).map((i) => i.id)).toEqual(["b"])
    expect(buscarIdeas(BANCO, { ...sinFiltro, texto: "por que" }).map((i) => i.id)).toEqual(["b"])
    expect(buscarIdeas(BANCO, { ...sinFiltro, texto: "control" }).map((i) => i.id)).toEqual(["c"])
  })

  it("finds a pillar by the name Coni knows it by", () => {
    expect(buscarIdeas(BANCO, { ...sinFiltro, texto: "deseo y sexualidad" }).map((i) => i.id)).toEqual(["a"])
  })

  it("finds an idea by its pillar's name from the catalog", () => {
    const propia = idea({ id: "e", pilar: "caso-coni", gancho: "Uso un avatar." })
    expect(buscarIdeas([...BANCO, propia], { ...sinFiltro, texto: "humana" }).map((i) => i.id)).toEqual(["e"])
  })

  it("finds an idea by its number", () => {
    expect(buscarIdeas(BANCO, { ...sinFiltro, texto: "#3" }).map((i) => i.id)).toEqual(["c"])
  })

  it("narrows by pillar, strength, alerts and use, and the filters add up", () => {
    expect(buscarIdeas(BANCO, { ...sinFiltro, pilar: "pareja" }).map((i) => i.id)).toEqual(["c", "d"])
    expect(buscarIdeas(BANCO, { ...sinFiltro, soloFuerzaAlta: true }).map((i) => i.id)).toEqual(["a", "c"])
    expect(buscarIdeas(BANCO, { ...sinFiltro, soloSinAlertas: true }).map((i) => i.id)).toEqual(["a", "c", "d"])
    expect(buscarIdeas(BANCO, { ...sinFiltro, soloSinUsar: true }).map((i) => i.id)).toEqual(["a", "b", "c"])
    expect(buscarIdeas(BANCO, { ...sinFiltro, pilar: "pareja", soloSinUsar: true }).map((i) => i.id)).toEqual(["c"])
  })

  it("returns nothing for a word that is nowhere", () => {
    expect(buscarIdeas(BANCO, { ...sinFiltro, texto: "zzz" })).toEqual([])
  })
})
