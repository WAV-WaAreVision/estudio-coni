import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { CostoDeAccion, LineaDeSaldo } from "@/components/ui/costo"
import { Medidor } from "@/components/ui/medidor"

describe("costo", () => {
  it("shows the amount at 24/600 tabular with its unit, right aligned", () => {
    render(<CostoDeAccion monto="US$ 1,16" unidad="~52 s" />)
    expect(screen.getByText("US$ 1,16")).toHaveClass("text-pieza", "tabular-nums")
    expect(screen.getByText("~52 s").parentElement).toHaveClass("text-right")
  })
  it("keeps the balance explanation with its figure, left aligned, never centred", () => {
    render(<LineaDeSaldo>ElevenLabs: te quedan 99.000 de 100.000 caracteres.</LineaDeSaldo>)
    expect(screen.getByText(/te quedan/)).not.toHaveClass("text-center")
  })
})

describe("Medidor", () => {
  it("says the figure in text and draws it as a meter in ink below 80 percent", () => {
    render(<Medidor gastado={22} tope={40} texto="Llevas US$ 22,00 este mes" />)
    const medidor = screen.getByRole("meter", { name: "Gasto del mes" })
    expect(medidor).toHaveAttribute("aria-valuenow", "22")
    expect(medidor).toHaveAttribute("aria-valuemax", "40")
    expect(screen.getByText("Llevas US$ 22,00 este mes")).toHaveClass("text-tinta")
    expect(screen.queryByRole("status")).toBeNull()
  })

  it("adds a warning icon from 80 percent, without changing colour", () => {
    render(<Medidor gastado={33} tope={40} texto="Llevas US$ 33,00 este mes" />)
    const cifra = screen.getByText("Llevas US$ 33,00 este mes")
    expect(cifra).toHaveClass("text-tinta")
    expect(cifra.querySelector("svg")).not.toBeNull()
    expect(screen.getByRole("meter", { name: "Gasto del mes" })).toHaveClass("bg-piedra-honda", "shadow-hundido")
  })

  it("adds the cap line when the cap is reached", () => {
    render(<Medidor gastado={40} tope={40} texto="Llevas US$ 40,00 este mes" />)
    expect(screen.getByRole("status")).toHaveTextContent("Llegaste al tope de gasto de este mes.")
  })
})
