import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { PanelDeAutor } from "@/app/(app)/biblioteca/autores/panel-de-autor"
import type { AutorResumido } from "@/lib/dominio/biblioteca/autores"

const ID = "11111111-2222-4333-8444-555555555555"
const autor: AutorResumido = {
  id: ID,
  nombre: "Daniela Ruiz",
  credencial: "investigadora",
  tipo: "persona",
  alias: [],
  materiales: 3,
  ideas: 12,
  temas: [{ id: "t1", nombre: "Carga mental", ideas: 8 }],
}

describe("PanelDeAutor", () => {
  it("is a region named by the author, with kind, counts and its top topics as links", () => {
    render(<PanelDeAutor autor={autor} />)
    const region = screen.getByRole("region", { name: "Daniela Ruiz" })
    expect(region).toHaveTextContent("Persona · investigadora")
    expect(region).toHaveTextContent("3 materiales · 12 ideas sacadas")
    expect(within(region).getByRole("link", { name: "Carga mental" })).toHaveAttribute("href", "/biblioteca/temas/t1")
    expect(within(region).getByRole("link", { name: "Ver todo de Daniela Ruiz" })).toHaveAttribute(
      "href",
      `/biblioteca/autores/${ID}`,
    )
  })

  it("has its own close control and a heading the focus can land on", () => {
    render(<PanelDeAutor autor={autor} />)
    expect(screen.getByRole("link", { name: "Cerrar el panel" })).toHaveAttribute("href", "/biblioteca/autores")
    expect(screen.getByRole("link", { name: "Cerrar el panel" })).toHaveAttribute("data-cierra-panel", ID)
    expect(screen.getByRole("heading", { level: 2 })).toHaveAttribute("id", "panel-titulo")
    expect(screen.getByRole("heading", { level: 2 })).toHaveAttribute("tabindex", "-1")
  })

  it("says how to give it material when it has none", () => {
    render(<PanelDeAutor autor={{ ...autor, materiales: 0, ideas: 0, temas: [] }} />)
    expect(screen.getByText(/Todavía no hay material de este autor/)).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Temas" })).toBeNull()
  })
})
