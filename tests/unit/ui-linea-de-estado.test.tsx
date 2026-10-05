import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"

describe("LineaDeEstado", () => {
  it("interrupts with role=alert when it is an error", () => {
    render(<LineaDeEstado tipo="error" titulo="No pude cargar esta pantalla." detalle="Puede ser la conexión." />)
    expect(screen.getByRole("alert")).toHaveTextContent("No pude cargar esta pantalla.Puede ser la conexión.")
  })

  it("waits politely (status) for the other tones", () => {
    render(<LineaDeEstado tipo="exito" titulo="Guardado" />)
    expect(screen.getByRole("status")).toHaveTextContent("Guardado")
  })

  it("colours the title when it is the state itself and keeps a message in ink", () => {
    const { rerender } = render(<LineaDeEstado tipo="exito" titulo="Lo viste completo" />)
    expect(screen.getByText("Lo viste completo")).toHaveClass("text-exito")
    rerender(<LineaDeEstado tipo="aviso" rotulo="Para confirmar:" titulo="La fuente es débil." tituloEnTinta />)
    expect(screen.getByText("Para confirmar:")).toHaveClass("text-aviso")
    expect(screen.getByText("La fuente es débil.")).toHaveClass("text-tinta")
  })

  it("never paints a background or a box", () => {
    const { container } = render(<LineaDeEstado tipo="aviso" titulo="Saldo bajo" />)
    expect(container.firstElementChild?.className).not.toMatch(/\bbg-|\bborder\b|rounded/)
  })

  it("renders its optional action aligned with the text", () => {
    render(<LineaDeEstado tipo="neutro" titulo="Puedes decir que no" accion={<a href="/x">Revisar la frase</a>} />)
    expect(screen.getByRole("link", { name: "Revisar la frase" }).parentElement).toHaveClass("col-start-2")
  })
})
