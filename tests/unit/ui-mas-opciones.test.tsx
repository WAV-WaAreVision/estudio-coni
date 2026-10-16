import { fireEvent, render, screen } from "@testing-library/react"
import { createRef } from "react"
import { describe, expect, it } from "vitest"
import { MasOpciones } from "@/components/ui/mas-opciones"

describe("MasOpciones", () => {
  it("folds its content under a raised summary with the title and one meta line", () => {
    render(
      <MasOpciones titulo="Más opciones" resumen="Avatar: Estudio">
        <p>Dentro</p>
      </MasOpciones>,
    )
    const detalles = screen.getByText("Más opciones").closest("details")
    expect(detalles).not.toHaveAttribute("open")
    expect(detalles).toHaveClass("bg-piedra", "shadow-relieve", "rounded-panel")
    expect(screen.getByText("Avatar: Estudio")).toHaveClass("text-apagado")
    fireEvent.click(screen.getByText("Más opciones"))
    expect(detalles).toHaveAttribute("open")
  })

  it("opens by itself when it holds something missing", () => {
    render(
      <MasOpciones titulo="Más opciones" resumen="Avatar: falta elegirlo" abiertaAlInicio>
        <p>Dentro</p>
      </MasOpciones>,
    )
    expect(screen.getByText("Más opciones").closest("details")).toHaveAttribute("open")
  })

  it("keeps what is inside mounted while folded, so a draft survives closing it", () => {
    render(
      <MasOpciones titulo="Editar el guion" forma="boton">
        <textarea aria-label="Guion" defaultValue="hola" />
      </MasOpciones>,
    )
    fireEvent.click(screen.getByText("Editar el guion"))
    fireEvent.change(screen.getByRole("textbox", { name: "Guion" }), { target: { value: "borrador" } })
    fireEvent.click(screen.getByText("Editar el guion"))
    expect(screen.getByRole("textbox", { name: "Guion" })).toHaveValue("borrador")
  })

  it("draws the summary as a full-width small secondary in the boton form", () => {
    render(
      <MasOpciones titulo="Editar el guion" forma="boton">
        <p>Dentro</p>
      </MasOpciones>,
    )
    expect(screen.getByText("Editar el guion").closest("summary")).toHaveClass(
      "bg-piedra",
      "shadow-relieve",
      "min-h-objetivo",
      "w-full",
    )
  })

  it("draws a neutral row under a hairline in the linea form", () => {
    render(
      <MasOpciones titulo="Desconectar LinkedIn" forma="linea">
        <p>Dentro</p>
      </MasOpciones>,
    )
    const detalles = screen.getByText("Desconectar LinkedIn").closest("details")
    expect(detalles).toHaveClass("border-t", "border-hilo")
    expect(detalles?.className).not.toMatch(/shadow-/)
  })

  it("hands its details element to a ref, so a screen can open it", () => {
    const ref = createRef<HTMLDetailsElement>()
    render(
      <MasOpciones ref={ref} titulo="Editar el guion">
        <p>Dentro</p>
      </MasOpciones>,
    )
    expect(ref.current?.tagName).toBe("DETAILS")
  })
})
