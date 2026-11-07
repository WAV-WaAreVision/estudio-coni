import { render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/app/(app)/biblioteca/semana/acciones", () => ({ proponerAhoraAccion: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }))

import { CorridaDeLaSemana, QueSubir } from "@/app/(app)/biblioteca/semana/vista-de-semana"
import type { CorridaLeida, QueSubirLeido } from "@/lib/dominio/biblioteca/semana"

const CORRIDA: CorridaLeida = {
  semana: "2026-11-08",
  estado: "lista",
  costoUsd: 0.21,
  ideas: 3,
  manual: false,
  motivoFallo: null,
  creadaEn: "2026-11-08T23:00:00Z",
}
const QUE_SUBIR: QueSubirLeido = {
  unSoloAutor: [
    { nombre: "Descanso digital", id: "55555555-5555-4555-8555-555555555555" },
    { nombre: "Sueño y pantallas", id: null },
  ],
  pilaresSinMaterial: [{ slug: "psicologia-en-la-mesa", nombreCorto: "Psicología en la mesa", red: "linkedin" }],
}

const iconosDe = (texto: string) => screen.getByText(texto, { exact: true }).parentElement?.querySelectorAll("svg")

describe("CorridaDeLaSemana", () => {
  it("names the week, its state as icon and word, and a ready run's ideas and cost", () => {
    render(<CorridaDeLaSemana corrida={CORRIDA} />)
    expect(screen.getByRole("heading", { name: "Semana del 2 al 8 de noviembre", level: 2 })).toBeInTheDocument()
    expect(iconosDe("Lista")).toHaveLength(1)
    expect(screen.getByText("3 ideas nuevas · Costó US$ 0,21")).toBeInTheDocument()
    expect(screen.queryByText("A pedido")).toBeNull()
  })

  it("marks a run she asked for", () => {
    render(<CorridaDeLaSemana corrida={{ ...CORRIDA, manual: true }} />)
    expect(iconosDe("A pedido")).toHaveLength(1)
  })

  it.each([
    ["corriendo", "Trabajando"],
    ["fallida", "Falló"],
  ])("draws a %s run as an icon and «%s», with no ideas line", (estado, palabra) => {
    render(<CorridaDeLaSemana corrida={{ ...CORRIDA, estado, ideas: 0, costoUsd: 0 }} />)
    expect(iconosDe(palabra)).toHaveLength(1)
    expect(screen.queryByText(/ideas nuevas/)).toBeNull()
  })
})

describe("QueSubir", () => {
  it("links the single-author topics it can, keeps the others as text, and names pillars with their network", () => {
    render(<QueSubir queSubir={QUE_SUBIR} />)
    const seccion = screen.getByRole("region", { name: "Qué subir después" })
    expect(within(seccion).getByRole("heading", { name: "Qué subir después", level: 2 })).toBeInTheDocument()
    expect(within(seccion).getByRole("link", { name: "Descanso digital" })).toHaveAttribute(
      "href",
      "/biblioteca/temas/55555555-5555-4555-8555-555555555555",
    )
    expect(within(seccion).getByText("Sueño y pantallas")).toBeInTheDocument()
    expect(within(seccion).queryByRole("link", { name: "Sueño y pantallas" })).toBeNull()
    expect(within(seccion).getByText("Psicología en la mesa · LinkedIn")).toBeInTheDocument()
  })

  it("says nothing is missing when both lists are empty, with no empty list", () => {
    render(<QueSubir queSubir={{ unSoloAutor: [], pilaresSinMaterial: [] }} />)
    expect(
      screen.getByText("Por ahora no falta nada: cada tema tiene varios autores y cada pilar tiene material."),
    ).toBeInTheDocument()
    expect(screen.queryByRole("list")).toBeNull()
  })

  it("draws nothing when the run says nothing about it", () => {
    const { container } = render(<QueSubir queSubir={null} />)
    expect(container).toBeEmptyDOMElement()
  })
})
