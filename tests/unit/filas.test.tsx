import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { FilaConCheck, FilaConValor, FilaNavegacion } from "@/components/ui/filas"

describe("filas", () => {
  it("FilaNavegacion is a 56 px link with a caret", () => {
    render(<FilaNavegacion href="/calendario">Ver calendario</FilaNavegacion>)
    expect(screen.getByRole("link", { name: "Ver calendario" })).toHaveClass("min-h-14")
  })

  it("FilaConValor puts the native select over the whole row so iOS shows its own wheel", () => {
    const alCambiar = vi.fn()
    render(
      <FilaConValor
        etiqueta="Meta de este mes"
        valor="consultas"
        opciones={[
          { valor: "consultas", etiqueta: "Consultas" },
          { valor: "seguidores", etiqueta: "Seguidores" },
        ]}
        alCambiar={alCambiar}
      />,
    )
    const select = screen.getByRole("combobox", { name: "Meta de este mes" })
    expect(select).toHaveClass("absolute", "inset-0", "opacity-0")
    fireEvent.change(select, { target: { value: "seguidores" } })
    expect(alCambiar).toHaveBeenCalledWith("seguidores")
    expect(screen.getByText("Consultas", { selector: "span" })).toBeVisible()
  })

  it("FilaConValor with a time shows it and hands the native time picker the whole row", () => {
    const alCambiar = vi.fn()
    render(<FilaConValor etiqueta="Hora del resumen" tipo="time" valor="08:30" alCambiar={alCambiar} />)
    const hora = screen.getByLabelText("Hora del resumen")
    expect(hora).toHaveAttribute("type", "time")
    fireEvent.change(hora, { target: { value: "09:15" } })
    expect(alCambiar).toHaveBeenCalledWith("09:15")
    expect(screen.getByText("08:30", { selector: "span" })).toHaveClass("tabular-nums")
  })

  it("FilaConCheck is a radio with the check on the chosen one", () => {
    render(<FilaConCheck nombre="fecha" valor="a" elegido etiqueta="jueves 8 de octubre · 19:00" alElegir={vi.fn()} />)
    expect(screen.getByRole("radio", { name: "jueves 8 de octubre · 19:00" })).toBeChecked()
  })

  it("FilaConCheck reports the value when it is chosen", () => {
    const alElegir = vi.fn()
    render(<FilaConCheck nombre="fecha" valor="b" elegido={false} etiqueta="viernes 9" alElegir={alElegir} />)
    fireEvent.click(screen.getByRole("radio", { name: "viernes 9" }))
    expect(alElegir).toHaveBeenCalledWith("b")
  })
})
