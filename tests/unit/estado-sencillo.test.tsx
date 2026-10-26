import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { EstadoSencillo } from "@/components/estado-sencillo"
import { pilarVisible } from "@/lib/dominio/pilares"
import { PILARES_DE_PRUEBA } from "../fixtures/pilares"

describe("EstadoSencillo", () => {
  it("goes back with the raised pill, then the meta row and the piece title", () => {
    render(
      <EstadoSencillo titulo="El deseo no se apaga" pilar={pilarVisible(PILARES_DE_PRUEBA, "caso-coni")} segundos={52}>
        <p>Estoy grabando tu video.</p>
      </EstadoSencillo>,
    )
    expect(screen.getByRole("link", { name: "Inicio" })).toHaveClass("shadow-relieve", "rounded-control")
    expect(screen.getByText("52 s").parentElement).toHaveClass("flex-wrap", "text-apagado")
    expect(screen.getByRole("heading", { level: 1, name: "El deseo no se apaga" })).toHaveClass("text-pieza")
    expect(screen.getByText("Estoy grabando tu video.")).toBeInTheDocument()
    // The gate header names the pillar by its short name.
    expect(screen.getByText("Caso Coni")).toBeInTheDocument()
  })
})
