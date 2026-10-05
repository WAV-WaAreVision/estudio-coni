import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ConfirmacionEnLinea } from "@/components/ui/confirmacion-en-linea"

describe("ConfirmacionEnLinea", () => {
  it("confirms a spend with the principal and never with the signature colour", () => {
    const alConfirmar = vi.fn()
    render(
      <ConfirmacionEnLinea
        trato="gasto"
        pregunta="¿Grabar el video? Cuesta unos US$ 1,36."
        confirmar="Sí, grabar"
        volver="Volver"
        alConfirmar={alConfirmar}
        alVolver={vi.fn()}
      />,
    )
    const si = screen.getByRole("button", { name: "Sí, grabar" })
    expect(si.className).not.toMatch(/firma/)
    fireEvent.click(si)
    expect(alConfirmar).toHaveBeenCalledTimes(1)
  })

  it("confirms a destructive action with an error outline, never filled", () => {
    render(
      <ConfirmacionEnLinea
        trato="destructivo"
        pregunta="Se escribe un guion nuevo y este se descarta. ¿Seguro?"
        confirmar="Sí, pedir cambios"
        volver="Volver"
        alConfirmar={vi.fn()}
        alVolver={vi.fn()}
      />,
    )
    const si = screen.getByRole("button", { name: "Sí, pedir cambios" })
    expect(si).toHaveClass("border-error", "text-error")
    expect(si.className).not.toMatch(/\bbg-(principal|error|firma)\b/)
  })

  it("moves focus to the question so a screen reader hears it", () => {
    render(
      <ConfirmacionEnLinea
        trato="neutro"
        pregunta="¿Volver a la versión de Claude?"
        confirmar="Sí, volver"
        volver="Cancelar"
        alConfirmar={vi.fn()}
        alVolver={vi.fn()}
      />,
    )
    expect(screen.getByText("¿Volver a la versión de Claude?")).toHaveFocus()
  })

  it("lets her go back", () => {
    const alVolver = vi.fn()
    render(
      <ConfirmacionEnLinea
        trato="gasto"
        pregunta="¿Seguro?"
        confirmar="Sí"
        volver="Volver"
        alConfirmar={vi.fn()}
        alVolver={alVolver}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Volver" }))
    expect(alVolver).toHaveBeenCalledTimes(1)
  })
})
