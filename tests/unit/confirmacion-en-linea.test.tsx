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

  it("confirms a destructive action with the raised destructive button and offers a secondary way back", () => {
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
    expect(si).toHaveClass("bg-piedra", "text-error", "shadow-relieve", "min-h-objetivo")
    expect(si.className).not.toMatch(/\bbg-(tinta|error|firma)\b/)
    expect(screen.getByRole("button", { name: "Volver" })).toHaveClass("bg-piedra", "text-tinta")
  })

  it("draws a destructive question as one honda block with the warning icon, like Desconectar", () => {
    render(
      <ConfirmacionEnLinea
        trato="destructivo"
        pregunta="Se descarta esta pieza y no sale. ¿Seguro?"
        confirmar="Sí, descartar"
        volver="Volver"
        alConfirmar={vi.fn()}
        alVolver={vi.fn()}
      />,
    )
    const bloque = screen.getByText("Se descarta esta pieza y no sale. ¿Seguro?").closest("[data-contorno]")
    expect(bloque).toHaveClass("bg-piedra-honda")
    expect(bloque?.querySelector("svg[aria-hidden='true']")).not.toBeNull()
    expect(bloque).toContainElement(screen.getByRole("button", { name: "Sí, descartar" }))
  })

  it("says a refusal as an error line inside its own block", () => {
    render(
      <ConfirmacionEnLinea
        trato="destructivo"
        pregunta="¿Seguro?"
        confirmar="Sí"
        volver="Volver"
        error="No pude descartarla."
        alConfirmar={vi.fn()}
        alVolver={vi.fn()}
      />,
    )
    const error = screen.getByRole("alert")
    expect(error).toHaveTextContent("No pude descartarla.")
    expect(error.closest("[data-contorno]")).toContainElement(screen.getByRole("button", { name: "Sí" }))
    expect(error.closest("[data-contorno]")?.querySelectorAll("[data-contorno]")).toHaveLength(0)
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
