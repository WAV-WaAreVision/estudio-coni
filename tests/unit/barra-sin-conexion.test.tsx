import { act, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { BarraSinConexion } from "@/components/barra-sin-conexion"

function cambiarConexion(enLinea: boolean) {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(enLinea)
  act(() => {
    window.dispatchEvent(new Event(enLinea ? "online" : "offline"))
  })
}

describe("BarraSinConexion", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("says nothing while there is a connection", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true)
    render(<BarraSinConexion />)

    expect(screen.queryByRole("status")).not.toBeInTheDocument()
  })

  it("warns when the connection drops, and does not promise to send what she approves", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true)
    render(<BarraSinConexion />)

    cambiarConexion(false)

    expect(screen.getByRole("status")).toHaveTextContent("Sin conexión. Aprueba cuando vuelva.")
  })

  it("goes away when the connection is back", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true)
    render(<BarraSinConexion />)
    cambiarConexion(false)

    cambiarConexion(true)

    expect(screen.queryByRole("status")).not.toBeInTheDocument()
  })

  it("says it without painting a background or a box, as a 2.75rem line with its icon in ink", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false)
    render(<BarraSinConexion />)

    const linea = screen.getByRole("status")
    expect(linea.className).not.toMatch(/\bbg-/)
    expect(linea).toHaveClass("min-h-objetivo", "border-hilo")
    expect(linea.querySelector("svg")?.getAttribute("class") ?? "").not.toMatch(/text-aviso/)
  })
})
