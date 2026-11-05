import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { EstadoSencillo } from "@/components/estado-sencillo"
import { FilaPieza } from "@/components/fila-pieza"

const CON_ANGULO = {
  slug: "psicologia-en-la-mesa",
  nombre: "Psicología en la mesa: la psicología donde se construye la IA",
  nombreCorto: "Psicología en la mesa",
  angulo: "Lo que construyo",
}

describe("the angle next to the pillar", () => {
  it("shows it in a piece's row", () => {
    render(
      <ul>
        <FilaPieza titulo="Entreno modelos" estado="Por firmar" pilar={CON_ANGULO} href="/guion/x" />
      </ul>,
    )
    expect(screen.getByText("Psicología en la mesa · Lo que construyo")).toBeInTheDocument()
  })

  it("shows it over a piece's title, and the pillar alone without one", () => {
    const { rerender } = render(
      <EstadoSencillo titulo="Entreno modelos" pilar={CON_ANGULO}>
        <p>Hola</p>
      </EstadoSencillo>,
    )
    expect(screen.getByText("Psicología en la mesa · Lo que construyo")).toBeInTheDocument()
    rerender(
      <EstadoSencillo titulo="Entreno modelos" pilar={{ ...CON_ANGULO, angulo: undefined }}>
        <p>Hola</p>
      </EstadoSencillo>,
    )
    expect(screen.getByText("Psicología en la mesa")).toBeInTheDocument()
  })
})
