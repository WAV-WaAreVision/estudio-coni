import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { SinFirmas } from "@/app/(app)/sin-firmas"

describe("SinFirmas", () => {
  it("promises new ideas on the engine's real schedule when the weekly ideas are on", () => {
    render(<SinFirmas motorSemanalActivo />)
    expect(screen.getByText("Nada espera tu firma esta semana.")).toBeInTheDocument()
    expect(screen.getByText("El domingo a las 20:00 te propongo ideas nuevas.")).toBeInTheDocument()
  })

  it("does not promise ideas when the weekly ideas are off, and says where to turn them on", () => {
    render(<SinFirmas motorSemanalActivo={false} />)
    expect(screen.queryByText(/te propongo/)).not.toBeInTheDocument()
    expect(screen.getByText(/Las ideas nuevas de cada domingo están apagadas\./)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Ajustes › Presupuesto" })).toHaveAttribute("href", "/ajustes/presupuesto")
  })
})
