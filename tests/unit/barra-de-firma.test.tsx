import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { BarraDeFirma } from "@/components/ui/barra-de-firma"

describe("BarraDeFirma", () => {
  it("is a labelled region fixed at the bottom with one action and one line", () => {
    render(
      <BarraDeFirma etiqueta="Firma" linea="Tienes 8 s para deshacer.">
        <button type="button">x</button>
      </BarraDeFirma>,
    )
    const barra = screen.getByRole("region", { name: "Firma" })
    expect(barra).toHaveClass("fixed", "bottom-0", "shadow-barra")
    expect(screen.getByText("Tienes 8 s para deshacer.")).toHaveClass("text-meta")
  })

  it("keeps the content above the home indicator", () => {
    render(
      <BarraDeFirma etiqueta="Firma">
        <button type="button">x</button>
      </BarraDeFirma>,
    )
    expect(screen.getByRole("button", { name: "x" }).parentElement?.className).toContain("env(safe-area-inset-bottom)")
  })
})
