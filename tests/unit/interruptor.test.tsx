import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { FilaConInterruptor } from "@/components/ui/filas"

describe("FilaConInterruptor", () => {
  it("is a switch named by its row, and the whole row toggles it", () => {
    const alCambiar = vi.fn()
    render(<FilaConInterruptor etiqueta="Resumen diario a las 08:30" encendido={false} alCambiar={alCambiar} />)
    const interruptor = screen.getByRole("switch", { name: "Resumen diario a las 08:30" })
    expect(interruptor).toHaveAttribute("aria-checked", "false")
    fireEvent.click(screen.getByText("Resumen diario a las 08:30"))
    expect(alCambiar).toHaveBeenCalledWith(true)
  })

  it("toggles once, not twice, when the switch itself is pressed", () => {
    const alCambiar = vi.fn()
    render(<FilaConInterruptor etiqueta="Avisos" encendido alCambiar={alCambiar} />)
    fireEvent.click(screen.getByRole("switch", { name: "Avisos" }))
    expect(alCambiar).toHaveBeenCalledTimes(1)
    expect(alCambiar).toHaveBeenCalledWith(false)
  })
})
