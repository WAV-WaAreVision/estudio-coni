import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { RitmoDelCalendario } from "@/components/ritmo-del-calendario"

const TEXTO =
  "Todavía no publicas. Tu ritmo es martes, jueves y sábado a las 19:00. Cuando salga la primera pieza, aquí verás si vas al día."
const BASE = { columnas: ["Mar", "Jue", "Sáb"], semanas: [], resumen: "van 0 de 0", sugerencia: null }

describe("RitmoDelCalendario", () => {
  it("teaches the schedule with a link to Ajustes before the first publication, never «0 de 0»", () => {
    render(<RitmoDelCalendario ritmo={{ ...BASE, vacio: true, antesDeEmpezar: TEXTO }} />)

    expect(screen.getByText(TEXTO)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Cambiar días y hora" })).toHaveAttribute("href", "/ajustes")
    expect(screen.queryByText("van 0 de 0")).toBeNull()
  })

  it("keeps the grid of what is scheduled under the teaching text", () => {
    render(
      <RitmoDelCalendario
        ritmo={{
          ...BASE,
          vacio: false,
          antesDeEmpezar: TEXTO,
          semanas: [
            {
              etiqueta: "12 oct",
              celdas: [
                { tipo: "libre", falta: false },
                { tipo: "llena", pilar: null, titulo: "Uno" },
                { tipo: "libre", falta: false },
              ],
            },
          ],
        }}
      />,
    )

    expect(screen.getByText(TEXTO)).toBeInTheDocument()
    expect(screen.getByText("Reel")).toBeInTheDocument()
    expect(screen.queryByText("van 0 de 0")).toBeNull()
  })
})
