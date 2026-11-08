import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { EstadoSencillo } from "@/components/estado-sencillo"
import { pilarVisible } from "@/lib/dominio/pilares"
import { PILARES_DE_PRUEBA } from "../fixtures/pilares"

const PILAR = pilarVisible(PILARES_DE_PRUEBA, "caso-coni")

function mostrar() {
  return render(
    <EstadoSencillo
      titulo="El deseo no se apaga"
      pilar={PILAR}
      segundos={52}
      lateral={<button type="button">Descartar</button>}
    >
      <p>Estoy grabando tu video.</p>
    </EstadoSencillo>,
  )
}

describe("EstadoSencillo", () => {
  it("goes back with the raised pill, then the meta row and the piece title", () => {
    mostrar()
    expect(screen.getByRole("link", { name: "Inicio" })).toHaveClass("shadow-relieve", "rounded-control")
    expect(screen.getByText("52 s").parentElement).toHaveClass("flex-wrap", "text-apagado")
    expect(screen.getByRole("heading", { level: 1, name: "El deseo no se apaga" })).toHaveClass("text-pieza")
    expect(screen.getByText("Estoy grabando tu video.")).toBeInTheDocument()
    // The gate header names the pillar by its short name.
    expect(screen.getByText("Caso Coni")).toBeInTheDocument()
  })

  it("marks itself as a wide screen, like the gates, so the column widens on a computer (issue 103)", () => {
    const { container } = mostrar()
    expect(container.querySelector("[data-ancho=puerta]")).not.toBeNull()
  })

  it("puts the state in the main slot and the piece's card (title, pillar, length) apart, for the side column", () => {
    mostrar()
    const principal = screen.getByTestId("estado-principal")
    expect(principal).toHaveTextContent("Estoy grabando tu video.")
    expect(within(principal).queryByRole("heading", { level: 1 })).toBeNull()
    const tarjeta = screen.getByTestId("estado-pieza")
    expect(within(tarjeta).getByRole("heading", { level: 1 })).toHaveTextContent("El deseo no se apaga")
    expect(tarjeta).toHaveTextContent("Caso Coni")
    expect(tarjeta).toHaveTextContent("52 s")
  })

  it("puts the side actions in their own slot under the card", () => {
    mostrar()
    const lateral = screen.getByTestId("estado-lateral")
    expect(within(lateral).getByRole("button", { name: "Descartar" })).toBeInTheDocument()
    expect(within(screen.getByTestId("estado-principal")).queryByRole("button")).toBeNull()
  })

  it("keeps the phone's order: the way back, the title, the state, then the side actions", () => {
    mostrar()
    const enOrden = [
      screen.getByRole("link", { name: "Inicio" }),
      screen.getByRole("heading", { level: 1 }),
      screen.getByText("Estoy grabando tu video."),
      screen.getByRole("button", { name: "Descartar" }),
    ]
    for (let i = 1; i < enOrden.length; i++) {
      expect(enOrden[i - 1].compareDocumentPosition(enOrden[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })

  it("leaves out the side slot when nothing goes there", () => {
    render(
      <EstadoSencillo titulo="Ya se publicó">
        <p>Salió solo.</p>
      </EstadoSencillo>,
    )
    expect(screen.queryByTestId("estado-lateral")).toBeNull()
  })
})
