import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { FilaConValor } from "@/components/ui/filas"

describe("FilaConValor", () => {
  it("offers a day with a native date field and shows the text it is given", () => {
    const alCambiar = vi.fn()
    render(<FilaConValor tipo="date" etiqueta="Día" valor="" mostrar="Elegir" alCambiar={alCambiar} />)

    expect(screen.getByText("Elegir")).toBeInTheDocument()
    const campo = screen.getByLabelText("Día")
    expect(campo).toHaveAttribute("type", "date")
    fireEvent.change(campo, { target: { value: "2026-10-28" } })
    expect(alCambiar).toHaveBeenCalledWith("2026-10-28")
  })

  it("passes the step to a time field", () => {
    render(<FilaConValor tipo="time" etiqueta="Hora" valor="10:15" step={300} alCambiar={() => {}} />)
    expect(screen.getByLabelText("Hora")).toHaveAttribute("step", "300")
    expect(screen.getByText("10:15")).toBeInTheDocument()
  })
})
