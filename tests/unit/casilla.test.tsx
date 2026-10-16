import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { Casilla } from "@/components/ui/casilla"

describe("Casilla", () => {
  it("is a checkbox and the whole 3.25rem row is its target", () => {
    const alCambiar = vi.fn()
    render(<Casilla etiqueta="Lo revisé y está bien" marcada={false} alCambiar={alCambiar} />)
    const casilla = screen.getByRole("checkbox", { name: "Lo revisé y está bien" })
    expect(casilla.closest("label")).toHaveClass("min-h-boton")
    fireEvent.click(screen.getByText("Lo revisé y está bien"))
    expect(alCambiar).toHaveBeenCalledWith(true)
  })

  it("draws the empty box sunken with a campo ring, and the checked one in ink with a light check", () => {
    const { rerender, container } = render(<Casilla etiqueta="Idea" marcada={false} alCambiar={vi.fn()} />)
    const caja = () => container.querySelector("label > span[aria-hidden]")
    expect(caja()).toHaveClass("size-casilla", "rounded-casilla", "bg-piedra-honda", "shadow-hundido", "outline-campo")
    rerender(<Casilla etiqueta="Idea" marcada alCambiar={vi.fn()} />)
    expect(caja()).toHaveClass("bg-tinta", "text-luz", "shadow-hundido-marcado")
    expect(caja()?.querySelector("svg")).not.toBeNull()
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

  it("names the checkbox by its label and describes it with the detail under it", () => {
    render(<Casilla etiqueta="¿Te achicas?" detalle="Autoestima" marcada={false} alCambiar={vi.fn()} />)
    expect(screen.getByRole("checkbox", { name: "¿Te achicas?" })).toHaveAccessibleDescription("Autoestima")
    expect(screen.getByText("Autoestima")).toHaveClass("text-apagado")
  })
})
