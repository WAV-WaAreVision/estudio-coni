import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { TextoEnParrafos } from "@/components/texto-en-parrafos"

describe("TextoEnParrafos", () => {
  it("draws one paragraph per block and keeps single line breaks", () => {
    const { container } = render(<TextoEnParrafos texto={"Uno.\n\nDos,\nsigue."} />)

    const parrafos = [...container.querySelectorAll("p")]
    expect(parrafos.map((parrafo) => parrafo.textContent)).toEqual(["Uno.", "Dos,\nsigue."])
    expect(parrafos[1]).toHaveClass("whitespace-pre-line")
  })

  it("shows markup as text, never as HTML or markdown", () => {
    const { container } = render(
      <TextoEnParrafos texto={'<script>alert("x")</script>\n\n**negrita** <b>no</b> [enlace](https://x.test)'} />,
    )

    expect(container.querySelector("script")).toBeNull()
    expect(container.querySelector("b")).toBeNull()
    expect(container.querySelector("a")).toBeNull()
    expect(screen.getByText('<script>alert("x")</script>')).toBeInTheDocument()
    expect(screen.getByText("**negrita** <b>no</b> [enlace](https://x.test)")).toBeInTheDocument()
  })
})
