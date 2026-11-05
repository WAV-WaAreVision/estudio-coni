import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { FilaDeTemas } from "@/app/(app)/biblioteca/temas/fila-de-temas"
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

describe("«Falta» on the Temas row", () => {
  const PSICOLOGIA = "33333333-2222-4333-8444-555555555555"
  const PILARES = [
    {
      id: PSICOLOGIA,
      slug: "psicologia-en-la-mesa",
      nombreCorto: "Psicología en la mesa",
      red: "linkedin" as const,
      esCapa: false,
    },
  ]

  it("adds the angles that fall short under the pillar, inside its link", () => {
    render(
      <FilaDeTemas
        filtros={{ red: "linkedin" }}
        pilares={PILARES}
        sinTratar={0}
        faltas={{ [PSICOLOGIA]: ["Lo que construyo"] }}
      />,
    )
    const pilares = screen.getByRole("list", { name: "Pilares de LinkedIn" })
    const enlace = within(pilares).getByRole("link", { name: /Psicología en la mesa/ })
    expect(enlace).toHaveTextContent("Psicología en la mesaFalta Lo que construyo")
  })

  it("adds nothing without a shortfall", () => {
    render(<FilaDeTemas filtros={{ red: "linkedin" }} pilares={PILARES} sinTratar={0} />)
    expect(screen.queryByText(/^Falta /)).toBeNull()
  })
})
