import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import BibliotecaNoAbrio from "@/app/(app)/biblioteca-no-abrio/page"

describe("the page when the Biblioteca does not open", () => {
  it("says so in plain Spanish and offers to try again or go to Inicio", () => {
    render(<BibliotecaNoAbrio />)

    expect(screen.getByRole("heading", { level: 1, name: "Biblioteca" })).toBeInTheDocument()
    expect(document.body.textContent).toContain("No pude abrir la Biblioteca.")
    expect(document.body.textContent).toContain("Vuelve a intentarlo en un momento.")
    expect(screen.getByRole("link", { name: "Volver a intentar" })).toHaveAttribute("href", "/ir-a-biblioteca")
    expect(screen.getByRole("link", { name: "Ir a Inicio" })).toHaveAttribute("href", "/")
  })
})
