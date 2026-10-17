import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { BarraDeMetrica } from "@/components/barra-de-metrica"
import { pilarVisible } from "@/lib/dominio/pilares"
import { PILARES_DE_PRUEBA } from "../fixtures/pilares"

const BASE = {
  titulo: "Si van a discutir, siéntense del mismo lado",
  pilar: pilarVisible(PILARES_DE_PRUEBA, "pareja"),
  ancho: 100,
  texto: "50,4 cada 1.000 · 121 guardados de 2.400 personas",
  cifra: "50,4",
  unidad: "cada 1.000",
  muestra: "121 guardados de 2.400 personas",
  reelsDelTema: 1,
}

describe("BarraDeMetrica", () => {
  it("draws a 4 px ink bar without a track and always says its sample", () => {
    const { container } = render(
      <ul>
        <BarraDeMetrica {...BASE} />
      </ul>,
    )
    expect(screen.getByText("50,4")).toHaveClass("text-pieza", "tabular-nums")
    expect(screen.getByText("cada 1.000")).toBeInTheDocument()
    expect(screen.getByText("121 guardados de 2.400 personas")).toBeInTheDocument()
    expect(container.querySelector("[data-pista]")).toBeNull()
    expect(container.querySelector("[data-barra]")).toHaveClass("h-1", "bg-tinta")
  })

  it("names the pillar as a word with its sample, never as a colour", () => {
    const { container } = render(
      <ul>
        <BarraDeMetrica {...BASE} />
      </ul>,
    )
    expect(screen.getByText("Pareja y conversación").parentElement).toHaveTextContent(
      "Pareja y conversación · 1 reel de este tema",
    )
    expect(container.innerHTML).not.toMatch(/pilar-/)
  })

  it("keeps the theme's sample whole when a long pillar name wraps", () => {
    render(
      <ul>
        <BarraDeMetrica
          {...BASE}
          pilar={{ slug: "practica-clinica", nombre: "Práctica clínica aumentada", nombreCorto: "Práctica clínica" }}
          reelsDelTema={3}
        />
      </ul>,
    )
    expect(screen.getByText("3 reels de este tema")).toHaveClass("whitespace-nowrap")
  })

  it("says it has no numbers yet, with no bar and no figure", () => {
    const { container } = render(
      <ul>
        <BarraDeMetrica
          {...BASE}
          ancho={0}
          cifra={null}
          muestra={null}
          texto="Todavía sin números: llegan cada mañana a las 7:00."
        />
      </ul>,
    )
    expect(screen.getByText("Todavía sin números: llegan cada mañana a las 7:00.")).toBeInTheDocument()
    expect(container.querySelector("[data-barra]")).toBeNull()
  })
})
