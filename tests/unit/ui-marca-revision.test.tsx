import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { MarcaRevision } from "@/components/ui/marca-revision"

describe("MarcaRevision", () => {
  it("asks Coni to tick 'Lo revisé y está bien' on a warning", () => {
    const alCambiar = vi.fn()
    render(
      <MarcaRevision
        hallazgo={{ regla: "numeros", tipo: "advierte", mensaje: "Escribe los números con palabras.", frase: "3" }}
        confirmada={false}
        alCambiar={alCambiar}
      />,
    )

    fireEvent.click(screen.getByRole("checkbox", { name: "Lo revisé y está bien" }))

    expect(alCambiar).toHaveBeenCalledWith(true)
    expect(screen.getByText("Escribe los números con palabras.")).toBeInTheDocument()
  })

  it("shows the marked phrase", () => {
    render(
      <MarcaRevision
        hallazgo={{ regla: "numeros", tipo: "advierte", mensaje: "Escribe los números con palabras.", frase: "3" }}
        confirmada={false}
        alCambiar={() => undefined}
      />,
    )

    expect(screen.getByText("3")).toBeInTheDocument()
  })

  it("has no tick on a blocking finding: it has to be fixed, not confirmed", () => {
    render(
      <MarcaRevision
        hallazgo={{
          regla: "cierre",
          tipo: "bloquea",
          mensaje: "El guion tiene que terminar con «Soy Coni del Rosario.»",
        }}
        confirmada={false}
        alCambiar={() => undefined}
      />,
    )

    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument()
    expect(screen.getByText(/no puedes aprobar/i)).toBeInTheDocument()
  })

  it("writes a warning as a honda block with its label in ink, never a coloured box", () => {
    const { container } = render(
      <MarcaRevision
        hallazgo={{ regla: "numeros", tipo: "advierte", mensaje: "Escribe los números con palabras.", frase: "3" }}
        confirmada={false}
        alCambiar={() => undefined}
      />,
    )

    expect(screen.getByText("Para confirmar:").closest("output")).toHaveClass("bg-piedra-honda")
    expect(container.innerHTML).not.toMatch(/\bbg-aviso|\bbg-error/)
  })

  it("says a blocking finding as an error alert", () => {
    render(
      <MarcaRevision
        hallazgo={{ regla: "cierre", tipo: "bloquea", mensaje: "Falta el cierre." }}
        confirmada={false}
        alCambiar={() => undefined}
      />,
    )

    expect(screen.getByRole("alert")).toHaveTextContent("Hay que corregirlo:")
    expect(screen.getByText("Hay que corregirlo:").closest("[role=alert]")).toHaveClass("bg-piedra-honda")
  })
})
