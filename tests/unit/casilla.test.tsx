import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { Casilla } from "@/components/ui/casilla"

describe("Casilla", () => {
  it("is a checkbox and the whole 56 px row is its target", () => {
    const alCambiar = vi.fn()
    render(<Casilla etiqueta="Lo revisé y está bien" marcada={false} alCambiar={alCambiar} />)
    const casilla = screen.getByRole("checkbox", { name: "Lo revisé y está bien" })
    expect(casilla.closest("label")).toHaveClass("min-h-14")
    fireEvent.click(screen.getByText("Lo revisé y está bien"))
    expect(alCambiar).toHaveBeenCalledWith(true)
  })

  it("stays focusable and reads as disabled at the limit", () => {
    const alCambiar = vi.fn()
    render(<Casilla etiqueta="Idea 6" marcada={false} deshabilitada alCambiar={alCambiar} />)
    const casilla = screen.getByRole("checkbox", { name: "Idea 6" })
    expect(casilla).toHaveAttribute("aria-disabled", "true")
    expect(casilla).not.toBeDisabled()
    fireEvent.click(casilla)
    expect(alCambiar).not.toHaveBeenCalled()
  })
})
