import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Grupo } from "@/components/ui/grupo"
import { Panel } from "@/components/ui/panel"

describe("Panel", () => {
  it("is a flat reading panel: piedra-alta, 24 px corners, 20 px padding, no shadow", () => {
    render(<Panel>El guion</Panel>)
    const panel = screen.getByText("El guion")
    expect(panel).toHaveClass("bg-piedra-alta", "rounded-panel", "p-5")
    expect(panel.className).not.toMatch(/shadow-/)
  })
})

describe("Grupo", () => {
  it("raises the rows that open something, divided by hairlines", () => {
    render(
      <Grupo lista>
        <li>Uno</li>
        <li>Dos</li>
      </Grupo>,
    )
    expect(screen.getByRole("list")).toHaveClass(
      "bg-piedra",
      "shadow-relieve",
      "rounded-panel",
      "divide-y",
      "divide-hilo",
    )
  })

  it("lays rows that open nothing flat on piedra-alta", () => {
    render(
      <Grupo plano>
        <p>Preparando la voz</p>
      </Grupo>,
    )
    const grupo = screen.getByText("Preparando la voz").parentElement
    expect(grupo).toHaveClass("bg-piedra-alta")
    expect(grupo?.className).not.toMatch(/shadow-/)
  })
})
