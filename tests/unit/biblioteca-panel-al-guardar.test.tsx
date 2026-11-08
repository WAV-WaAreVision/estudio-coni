import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { PanelAlGuardar } from "@/app/(app)/biblioteca/temas/panel-al-guardar"

describe("PanelAlGuardar", () => {
  it("says a pillar draft waits in Borradores and enters Temas once approved", () => {
    render(<PanelAlGuardar tipo="pilar" />)
    const panel = screen.getByRole("region", { name: "Al guardar" })
    expect(
      within(panel)
        .getAllByRole("listitem")
        .map((linea) => linea.textContent),
    ).toEqual([
      "Guardar no cambia tus pilares: el borrador espera en Borradores.",
      "Al aprobarlo revisas los pesos de la red, y ahí entra a Temas.",
    ])
  })

  it("says a network draft waits for its connection and can still change", () => {
    render(<PanelAlGuardar tipo="red" />)
    const panel = screen.getByRole("region", { name: "Al guardar" })
    expect(
      within(panel)
        .getAllByRole("listitem")
        .map((linea) => linea.textContent),
    ).toEqual([
      "Guardar no conecta la red: el borrador espera en Borradores.",
      "Mientras espera conexión, puedes editarlo o descartarlo.",
    ])
  })

  it("is drawn only on a computer: the phone keeps the form alone", () => {
    render(<PanelAlGuardar tipo="pilar" />)
    expect(screen.getByTestId("pagina-panel")).toHaveClass("hidden", "md:block")
  })
})
