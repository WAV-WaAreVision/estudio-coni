import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"

describe("LineaDeEstado", () => {
  it("interrupts with an error block", () => {
    render(<LineaDeEstado tipo="error" titulo="No pude cargar esta pantalla." detalle="Puede ser la conexión." />)
    const alerta = screen.getByRole("alert")
    expect(alerta).toHaveTextContent("No pude cargar esta pantalla.Puede ser la conexión.")
    expect(alerta).toHaveClass("bg-piedra-honda")
    expect(screen.getByText("No pude cargar esta pantalla.")).toHaveClass("text-error")
  })

  it("says success as a flat ok pill, politely", () => {
    render(<LineaDeEstado tipo="exito" titulo="Guardado" />)
    const estado = screen.getByRole("status")
    expect(estado).toHaveTextContent("Guardado")
    expect(screen.getByText("Guardado").parentElement).toHaveClass("bg-piedra-honda", "min-h-pildora")
    expect(estado.innerHTML).not.toMatch(/shadow-/)
  })

  it("draws a warning as a honda block with its icon, in ink", () => {
    render(<LineaDeEstado tipo="aviso" titulo="Llegaste al tope de gasto de este mes." />)
    const estado = screen.getByRole("status")
    expect(estado).toHaveClass("bg-piedra-honda")
    expect(estado.querySelector("svg")).not.toBeNull()
    expect(estado.innerHTML).not.toMatch(/text-error/)
  })

  it("keeps an error title in ink when it is a message", () => {
    render(<LineaDeEstado tipo="error" titulo="Esto cambió mientras lo revisabas." tituloEnTinta />)
    expect(screen.getByText("Esto cambió mientras lo revisabas.")).toHaveClass("text-tinta")
  })

  it("is a flat line with its icon for neutral news, without a box", () => {
    render(<LineaDeEstado tipo="neutro" titulo="Puedes decir que no" accion={<a href="/x">Revisar la frase</a>} />)
    const estado = screen.getByRole("status")
    expect(estado.className).not.toMatch(/\bbg-/)
    expect(screen.getByRole("link", { name: "Revisar la frase" })).toBeInTheDocument()
  })

  it("is not a live region when it is a date the screen simply states", () => {
    render(<LineaDeEstado tipo="fecha" titulo="Si lo firmas hoy, sale el jueves" />)
    expect(screen.queryByRole("status")).toBeNull()
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("does not interrupt again for an error already announced", () => {
    render(<LineaDeEstado tipo="error" titulo="Hay que corregirlo" anunciada />)
    expect(screen.queryByRole("alert")).toBeNull()
  })
})
