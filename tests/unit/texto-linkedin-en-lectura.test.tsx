import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { TextoLinkedinEnLectura } from "@/components/texto-linkedin-en-lectura"

describe("TextoLinkedinEnLectura", () => {
  it("shows the saved text as it is, with its line breaks, and says where she reviews it", () => {
    const { container } = render(<TextoLinkedinEnLectura texto={"Primera línea.\n\nSegunda línea."} />)

    expect(screen.getByRole("heading", { name: "Texto para LinkedIn" })).toBeInTheDocument()
    const texto = container.querySelector("p.whitespace-pre-line")
    expect(texto).toHaveTextContent("Primera línea. Segunda línea.")
    expect(texto?.textContent).toBe("Primera línea.\n\nSegunda línea.")
    expect(screen.getByText("Lo revisas y editas al aprobar el video.")).toHaveClass("text-apagado")
  })

  it("has nothing to edit: no button, no field", () => {
    render(<TextoLinkedinEnLectura texto="Hola." />)
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
  })

  it("says how long it is", () => {
    render(<TextoLinkedinEnLectura texto={"a".repeat(1234)} />)
    expect(screen.getByText("1.234 de 3.000")).toBeInTheDocument()
  })
})
