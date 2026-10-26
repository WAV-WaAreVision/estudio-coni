import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
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
    expect(screen.getByText("Graba el video").closest("p")).toHaveAttribute("id", "consecuencia")
    expect(screen.getByText("Graba el video").closest("p")).toHaveClass("text-center", "text-apagado")
  })
  it("renders two equal parts of the consequence without React losing track of either", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      render(
        <BarraDeFirma consecuencia="Sale mañana · US$ 3,36 · US$ 3,36" idConsecuencia="c">
          <button type="button">x</button>
        </BarraDeFirma>,
      )
      expect(document.querySelectorAll("#c [data-parte]")).toHaveLength(3)
      expect(error).not.toHaveBeenCalled()
    } finally {
      error.mockRestore()
    }
  })

  it("keeps each part of the consequence whole, so a narrow line breaks between parts, never inside a price", () => {
    render(
      <BarraDeFirma consecuencia="Graba el video · US$ 3,36 · 8 s para deshacer" idConsecuencia="c">
        <button type="button">x</button>
      </BarraDeFirma>,
    )
    const linea = document.getElementById("c")
    expect(linea).toHaveTextContent("Graba el video · US$ 3,36 · 8 s para deshacer")
    const partes = Array.from(linea?.querySelectorAll("[data-parte]") ?? [])
    expect(partes.map((parte) => parte.textContent)).toEqual(["Graba el video", "US$ 3,36", "8 s para deshacer"])
    for (const parte of partes) expect(parte).toHaveClass("inline-block")
  })
})

describe("BarraDeFirma: a consequence that moves with the clock", () => {
  it("marks it for the visual baselines to mask, and only when asked", () => {
    const { rerender } = render(
      <BarraDeFirma consecuencia="Sale el sábado 17 · 19:00" idConsecuencia="c" consecuenciaVaria>
        <button type="button">x</button>
      </BarraDeFirma>,
    )
    expect(document.getElementById("c")).toHaveAttribute("data-snapshot", "varia")
    rerender(
      <BarraDeFirma consecuencia="Graba el video" idConsecuencia="c">
        <button type="button">x</button>
      </BarraDeFirma>,
    )
    expect(document.getElementById("c")).not.toHaveAttribute("data-snapshot")
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
