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

  it("announces itself politely, from <body>, not from where it was rendered", () => {
    render(
      <div data-testid="lugar">
        <Aviso mensaje="Guardado" alCerrar={() => undefined} />
      </div>,
    )
    const estado = screen.getByRole("status")
    expect(estado).toHaveTextContent("Guardado")
    expect(estado.parentElement).toBe(document.body)
    expect(screen.getByTestId("lugar")).toBeEmptyDOMElement()
  })

  it("renders nothing on the server: the live region mounts empty in the browser and fills after", () => {
    expect(renderToStaticMarkup(<Aviso mensaje="Guardado" alCerrar={() => undefined} />)).toBe("")
  })

  it("stays 8 seconds by default", () => {
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

  it("sits above the nav by default and at the top on a signing screen", () => {
    const { rerender } = render(<Aviso mensaje="Guardado" alCerrar={() => undefined} />)
    expect(screen.getByRole("status")).toHaveAttribute("data-lugar", "nav")
    rerender(<Aviso mensaje="Guardado" alCerrar={() => undefined} lugar="arriba" />)
    expect(screen.getByRole("status")).toHaveAttribute("data-lugar", "arriba")
  })

  it("reads light on ink with high relief, and a 2.75rem light pill to undo", () => {
    render(<Aviso mensaje="Idea descartada" alCerrar={() => undefined} alDeshacer={() => undefined} />)
    expect(screen.getByRole("status")).toHaveClass("bg-tinta", "text-luz", "rounded-toast", "shadow-relieve-alto")
    expect(screen.getByRole("button", { name: "Deshacer" })).toHaveClass("min-h-objetivo", "bg-luz", "text-tinta")
  })

  it("offers 'Deshacer' only when there is something to undo", () => {
    const { rerender } = render(<Aviso mensaje="Guardado" alCerrar={() => undefined} />)
    expect(screen.queryByRole("button", { name: "Deshacer" })).toBeNull()
    const alDeshacer = vi.fn()
    rerender(<Aviso mensaje="Guardado" alCerrar={() => undefined} alDeshacer={alDeshacer} />)
    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }))
    expect(alDeshacer).toHaveBeenCalledTimes(1)
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
