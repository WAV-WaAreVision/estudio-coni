import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { FilaConValor } from "@/components/ui/filas"

describe("FilaConValor", () => {
  it("offers a day with a native date field and shows the text it is given", () => {
    const alCambiar = vi.fn()
    render(<FilaConValor tipo="date" etiqueta="Día" valor="" mostrar="Elegir" alCambiar={alCambiar} />)

    expect(screen.getByText("Elegir")).toBeInTheDocument()
    const campo = screen.getByLabelText(/^Día/)
    expect(campo).toHaveAttribute("type", "date")
    fireEvent.change(campo, { target: { value: "2026-10-28" } })
    expect(alCambiar).toHaveBeenCalledWith("2026-10-28")
  })

  it("passes the step to a time field", () => {
    render(<FilaConValor tipo="time" etiqueta="Hora" valor="10:15" step={300} alCambiar={() => {}} />)
    expect(screen.getByLabelText("Hora")).toHaveAttribute("step", "300")
    expect(screen.getByText("10:15")).toBeInTheDocument()
  })

  it("passes the step only to a time field", () => {
    render(<FilaConValor tipo="date" etiqueta="Día" valor="" step={300} alCambiar={() => {}} />)
    expect(screen.getByLabelText("Día")).not.toHaveAttribute("step")
  })

  it("reads the shown text once, in the field's name, when it is given", () => {
    render(
      <FilaConValor
        tipo="date"
        etiqueta="Día"
        valor="2026-10-28"
        mostrar="miércoles 28 de octubre"
        alCambiar={() => {}}
      />,
    )
    expect(screen.getByLabelText("Día: miércoles 28 de octubre")).toHaveAttribute("type", "date")
    expect(screen.getByText("miércoles 28 de octubre")).toHaveAttribute("aria-hidden", "true")
  })

  it("keeps the plain name when no shown text is given", () => {
    render(<FilaConValor tipo="time" etiqueta="Hora" valor="10:15" alCambiar={() => {}} />)
    expect(screen.getByLabelText("Hora")).toHaveAttribute("type", "time")
  })

  it.each(["date", "time"] as const)("opens the native %s picker on a click where the browser has one", (tipo) => {
    render(<FilaConValor tipo={tipo} etiqueta="Campo" valor="" alCambiar={() => {}} />)
    const campo = screen.getByLabelText("Campo") as HTMLInputElement
    const showPicker = vi.fn()
    Object.defineProperty(campo, "showPicker", { value: showPicker, configurable: true })
    fireEvent.click(campo)
    expect(showPicker).toHaveBeenCalledOnce()
  })

  it("does not break a click where the browser has no picker to open", () => {
    render(<FilaConValor tipo="date" etiqueta="Campo" valor="" alCambiar={() => {}} />)
    const campo = screen.getByLabelText("Campo")
    Object.defineProperty(campo, "showPicker", { value: undefined, configurable: true })
    expect(() => fireEvent.click(campo)).not.toThrow()
  })
})
