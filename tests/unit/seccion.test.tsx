import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Seccion } from "@/components/seccion"

describe("Seccion", () => {
  it("is a region named by its label, with the figure on the right of the same line", () => {
    render(
      <Seccion id="firma" titulo="Necesita tu firma" cifra="2">
        <p>x</p>
      </Seccion>,
    )
    const region = screen.getByRole("region", { name: "Necesita tu firma" })
    expect(region).toHaveTextContent("Necesita tu firma2x")
    expect(screen.getByText("2")).toHaveClass("tabular-nums")
  })

  it("opens with its label alone, no rule and no box (v6 .sech)", () => {
    render(
      <Seccion id="s" titulo="Necesita tu firma" cifra="2">
        <p>x</p>
      </Seccion>,
    )
    const cabecera = screen.getByRole("heading", { name: "Necesita tu firma" }).parentElement
    expect(cabecera?.className).not.toMatch(/border/)
    expect(screen.getByRole("heading", { name: "Necesita tu firma" })).toHaveClass("text-meta", "font-semibold")
    expect(screen.getByText("2")).toHaveClass("text-apagado", "font-medium")
    expect(screen.getByRole("region", { name: "Necesita tu firma" })).toHaveClass("mt-8")
  })
})
