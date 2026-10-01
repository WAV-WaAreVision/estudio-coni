import { act, fireEvent, render, screen } from "@testing-library/react"
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

  it("closes by itself after 4.5 seconds", () => {
    const alCerrar = vi.fn()
    render(<Aviso mensaje="Guardado" alCerrar={alCerrar} />)

    act(() => {
      vi.advanceTimersByTime(4499)
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
})
