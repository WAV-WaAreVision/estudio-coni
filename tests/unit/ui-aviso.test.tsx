import { act, fireEvent, render, screen } from "@testing-library/react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Aviso } from "@/components/ui/aviso"

describe("Aviso", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("announces itself politely", () => {
    render(<Aviso mensaje="Guardado" alCerrar={() => undefined} />)

    expect(screen.getByRole("status")).toHaveTextContent("Guardado")
  })

  it("stays 8 seconds by default (brandkit 9.23)", () => {
    const alCerrar = vi.fn()
    render(<Aviso mensaje="Guardado" alCerrar={alCerrar} />)

    act(() => {
      vi.advanceTimersByTime(7999)
    })
    expect(alCerrar).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(1)
    })

    expect(alCerrar).toHaveBeenCalledTimes(1)
  })

  it("offers 'Deshacer' only when there is something to undo", () => {
    const { rerender } = render(<Aviso mensaje="Guardado" alCerrar={() => undefined} />)
    expect(screen.queryByRole("button", { name: "Deshacer" })).not.toBeInTheDocument()

    const alDeshacer = vi.fn()
    rerender(<Aviso mensaje="Guardado" alCerrar={() => undefined} alDeshacer={alDeshacer} />)
    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }))

    expect(alDeshacer).toHaveBeenCalledTimes(1)
  })

  it("rides above the sign bar instead of the bottom nav when asked", () => {
    const { rerender } = render(<Aviso mensaje="Guardado" alCerrar={() => undefined} />)
    expect(screen.getByRole("status").className).toContain("bottom-[calc(56px+")

    rerender(<Aviso mensaje="Guardado" alCerrar={() => undefined} sobreBarra />)
    expect(screen.getByRole("status").className).toContain("bottom-[calc(var(--barra-max)+")
  })

  it("reads in the ink-on-surface pair with a 44 px undo", () => {
    render(<Aviso mensaje="Idea descartada" alCerrar={() => undefined} alDeshacer={() => undefined} />)
    expect(screen.getByRole("status")).toHaveClass("bg-tinta", "text-sobre-tinta")
    expect(screen.getByRole("button", { name: "Deshacer" })).toHaveClass("min-h-11", "text-sobre-tinta")
  })

  it("paints its live region empty and fills it after mount, so screen readers announce the message", () => {
    const primerPintado = renderToStaticMarkup(<Aviso mensaje="Guardado" alCerrar={() => undefined} />)
    expect(primerPintado).toContain("<output")
    expect(primerPintado).not.toContain("Guardado")

    render(<Aviso mensaje="Guardado" alCerrar={() => undefined} />)
    expect(screen.getByRole("status")).toHaveTextContent("Guardado")
  })

  it("moves focus to 'Deshacer' when asked, and leaves it alone otherwise", () => {
    const { unmount } = render(<Aviso mensaje="Guardado" alCerrar={() => undefined} alDeshacer={() => undefined} />)
    expect(screen.getByRole("button", { name: "Deshacer" })).not.toHaveFocus()
    unmount()

    render(<Aviso mensaje="Firmaste." alCerrar={() => undefined} alDeshacer={() => undefined} enfocarDeshacer />)
    expect(screen.getByRole("button", { name: "Deshacer" })).toHaveFocus()
  })

  it("waits for an undo it tracks: 'Deshaciendo…' disabled, no second undo, and it does not close by itself", () => {
    const alCerrar = vi.fn()
    const alDeshacer = vi.fn()
    const { rerender } = render(
      <Aviso mensaje="Firmaste." alCerrar={alCerrar} alDeshacer={alDeshacer} deshaciendo={false} />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }))
    expect(alDeshacer).toHaveBeenCalledTimes(1)
    expect(alCerrar).not.toHaveBeenCalled()

    rerender(<Aviso mensaje="Firmaste." alCerrar={alCerrar} alDeshacer={alDeshacer} deshaciendo />)
    const boton = screen.getByRole("button", { name: "Deshaciendo…" })
    expect(boton).toHaveAttribute("aria-disabled", "true")
    fireEvent.click(boton)
    act(() => {
      vi.advanceTimersByTime(8000)
    })

    expect(alDeshacer).toHaveBeenCalledTimes(1)
    expect(alCerrar).not.toHaveBeenCalled()
  })

  it("closes right after an undo it does not track", () => {
    const alCerrar = vi.fn()
    render(<Aviso mensaje="Guardado" alCerrar={alCerrar} alDeshacer={() => undefined} />)
    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }))
    expect(alCerrar).toHaveBeenCalledTimes(1)
  })
})
