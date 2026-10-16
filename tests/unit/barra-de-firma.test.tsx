import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { BarraDeFirma, LineaDeFalta, ResumenListo } from "@/components/ui/barra-de-firma"

describe("BarraDeFirma", () => {
  it("is the labelled sign bar that sticks to the bottom, high relief, rounded on top", () => {
    render(
      <BarraDeFirma consecuencia="Graba el video · 8 s para deshacer" idConsecuencia="c">
        <button type="button">x</button>
      </BarraDeFirma>,
    )
    const barra = screen.getByRole("region", { name: "Firma" })
    expect(barra).toHaveAttribute("data-barra-de-firma")
    expect(barra).toHaveClass("sticky", "bottom-0", "shadow-relieve-alto-fijo", "rounded-t-barra")
    expect(barra.className).toContain("env(safe-area-inset-bottom)")
  })

  it("puts what is above the track first and the consequence under it, centred, with its id", () => {
    render(
      <BarraDeFirma arriba={<p>Falta algo</p>} consecuencia="Graba el video" idConsecuencia="consecuencia">
        <button type="button">pista</button>
      </BarraDeFirma>,
    )
    const barra = screen.getByRole("region", { name: "Firma" })
    expect(Array.from(barra.children).map((hijo) => hijo.textContent)).toEqual([
      "Falta algo",
      "pista",
      "Graba el video",
    ])
    expect(screen.getByText("Graba el video")).toHaveAttribute("id", "consecuencia")
    expect(screen.getByText("Graba el video")).toHaveClass("text-center", "text-apagado")
  })
})

describe("LineaDeFalta", () => {
  it("says what is missing after 'Falta:', joined with a middle dot, with the info icon", () => {
    render(<LineaDeFalta id="f" cosas={["guardar tus cambios", "escuchar tu voz"]} />)
    const linea = screen.getByText(/guardar tus cambios · escuchar tu voz/).closest("p")
    expect(linea).toHaveTextContent("Falta: guardar tus cambios · escuchar tu voz")
    expect(linea).toHaveAttribute("id", "f")
    expect(linea?.querySelector("svg")).not.toBeNull()
  })
})

describe("ResumenListo", () => {
  it("lists what is done, each with its check", () => {
    render(<ResumenListo id="r" cosas={["Video visto", "Texto"]} />)
    const linea = screen.getByText("Video visto").closest("p")
    expect(linea).toHaveAttribute("id", "r")
    expect(linea?.querySelectorAll("svg")).toHaveLength(2)
  })
})
