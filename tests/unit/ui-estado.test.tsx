import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { PildoraDeEstado } from "@/components/ui/estado"

const TIPOS = ["ok", "aviso", "error", "neutro"] as const

describe("PildoraDeEstado", () => {
  it("is flat: a state that looks like a button is wrong", () => {
    for (const tipo of TIPOS) {
      const { container, unmount } = render(<PildoraDeEstado tipo={tipo}>Conectada</PildoraDeEstado>)
      const pildora = container.firstElementChild
      expect(pildora).toHaveClass("min-h-pildora", "rounded-control", "text-meta", "font-semibold")
      expect(pildora?.className).not.toMatch(/shadow-/)
      unmount()
    }
  })

  it("carries an icon for ok, aviso and error, and none for neutro", () => {
    for (const tipo of TIPOS) {
      const { container, unmount } = render(<PildoraDeEstado tipo={tipo}>Estado</PildoraDeEstado>)
      expect(container.querySelector("svg") !== null, tipo).toBe(tipo !== "neutro")
      unmount()
    }
  })

  it("writes an error in magenta on honda, and every other state in ink", () => {
    render(<PildoraDeEstado tipo="error">Desconectada</PildoraDeEstado>)
    expect(screen.getByText("Desconectada").parentElement).toHaveClass("bg-piedra-honda", "text-error")
  })

  it("puts the neutral state on piedra-alta", () => {
    render(<PildoraDeEstado tipo="neutro">A mano</PildoraDeEstado>)
    expect(screen.getByText("A mano").parentElement).toHaveClass("bg-piedra-alta", "text-tinta")
  })
})
