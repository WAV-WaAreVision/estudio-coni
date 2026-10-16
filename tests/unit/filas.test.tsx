import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { Eleccion, FilaConValor, FilaNavegacion } from "@/components/ui/filas"

describe("filas", () => {
  it("FilaNavegacion is a 3.75rem group row with a chevron, without a border of its own", () => {
    render(<FilaNavegacion href="/calendario">Ver calendario</FilaNavegacion>)
    const enlace = screen.getByRole("link", { name: "Ver calendario" })
    expect(enlace).toHaveClass("min-h-fila-baja", "active:bg-piedra-honda")
    expect(enlace.className).not.toMatch(/border/)
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

  it("Eleccion is a radio row; the chosen one fills with ink around a light dot", () => {
    const { container } = render(
      <Eleccion nombre="fecha" valor="a" elegido etiqueta="jueves 8 de octubre · 19:00" alElegir={vi.fn()} />,
    )
    expect(screen.getByRole("radio", { name: "jueves 8 de octubre · 19:00" })).toBeChecked()
    expect(container.querySelector("label > span[aria-hidden]")).toHaveClass("size-casilla", "bg-tinta")
  })

  it("Eleccion reports the value when it is chosen, and carries a detail and an image when given", () => {
    const alElegir = vi.fn()
    render(
      <Eleccion
        nombre="avatar"
        valor="look-b"
        elegido={false}
        etiqueta="Terraza"
        detalle="Exterior"
        imagen={<span data-testid="foto" />}
        alElegir={alElegir}
      />,
    )
    fireEvent.click(screen.getByRole("radio", { name: "Terraza" }))
    expect(alElegir).toHaveBeenCalledWith("look-b")
    expect(screen.getByRole("radio", { name: "Terraza" })).toHaveAccessibleDescription("Exterior")
    expect(screen.getByTestId("foto")).toBeInTheDocument()
  })
})
