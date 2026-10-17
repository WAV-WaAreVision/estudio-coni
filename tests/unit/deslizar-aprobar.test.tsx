import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DeslizarParaAprobar } from "@/components/deslizar-para-aprobar"

const pista = () => screen.getByRole("slider", { name: "Desliza para firmar" })
const pulgar = () => screen.getByTestId("pulgar-firma")

function caja(ancho: number): DOMRect {
  return { width: ancho, left: 0, right: ancho, top: 0, bottom: 56, height: 56, x: 0, y: 0, toJSON: () => ({}) }
}

beforeEach(() => {
  // Track 356 px, thumb 48 px, 4 px inset on each side: free travel 300 px.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return caja(this.dataset.testid === "pulgar-firma" ? 48 : 356)
  })
  HTMLElement.prototype.setPointerCapture = vi.fn()
  HTMLElement.prototype.releasePointerCapture = vi.fn()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function arrastrar(hasta: number) {
  fireEvent.pointerDown(pulgar(), { pointerId: 1, clientX: 0, clientY: 20 })
  fireEvent.pointerMove(pista(), { pointerId: 1, clientX: hasta, clientY: 20 })
  fireEvent.pointerUp(pista(), { pointerId: 1, clientX: hasta, clientY: 20 })
}

function tocar() {
  fireEvent.pointerDown(pista(), { pointerId: 1, clientX: 200, clientY: 20 })
  fireEvent.pointerUp(pista(), { pointerId: 1, clientX: 202, clientY: 21 })
}

describe("DeslizarParaAprobar: drag", () => {
  it("starts unsigned, labelled 'Desliza para firmar'", () => {
    render(<DeslizarParaAprobar habilitado alFirmar={vi.fn()} />)
    expect(pista()).toHaveAttribute("aria-valuenow", "0")
    expect(pista()).toHaveAttribute("aria-valuetext", "Sin firmar")
    expect(pista()).toHaveTextContent("Desliza para firmar")
  })

  it("signs on release after a drag of the thumb past 96 percent, once", () => {
    const alFirmar = vi.fn()
    render(<DeslizarParaAprobar habilitado alFirmar={alFirmar} />)
    arrastrar(300)
    arrastrar(300)
    expect(alFirmar).toHaveBeenCalledTimes(1)
    expect(pista()).toHaveAttribute("aria-valuetext", "Firmado")
    expect(pista()).toHaveTextContent("Firmado")
  })

  it("springs back when released before 96 percent", () => {
    const alFirmar = vi.fn()
    render(<DeslizarParaAprobar habilitado alFirmar={alFirmar} />)
    arrastrar(280)
    expect(alFirmar).not.toHaveBeenCalled()
    expect(pista()).toHaveAttribute("aria-valuenow", "0")
  })

  it("treats a pointer that moves off the thumb as a scroll, never a tap or a signature", () => {
    const alFirmar = vi.fn()
    render(<DeslizarParaAprobar habilitado alFirmar={alFirmar} />)
    fireEvent.pointerDown(pista(), { pointerId: 1, clientX: 100, clientY: 20 })
    fireEvent.pointerMove(pista(), { pointerId: 1, clientX: 100, clientY: 60 })
    fireEvent.pointerUp(pista(), { pointerId: 1, clientX: 100, clientY: 60 })
    expect(alFirmar).not.toHaveBeenCalled()
    expect(pista()).toHaveAttribute("aria-valuetext", "Sin firmar")
  })
})

describe("DeslizarParaAprobar: tap to arm, tap to sign (WCAG 2.5.7)", () => {
  it("arms and then signs on assistive-technology clicks that send no pointer events (detail 0)", () => {
    const alFirmar = vi.fn()
    render(<DeslizarParaAprobar habilitado alFirmar={alFirmar} />)
    fireEvent.click(pista(), { detail: 0 })
    expect(alFirmar).not.toHaveBeenCalled()
    expect(pista()).toHaveAttribute("aria-valuetext", "Toca otra vez para firmar")
    act(() => {
      vi.advanceTimersByTime(500)
    })
    fireEvent.click(pista(), { detail: 0 })
    expect(alFirmar).toHaveBeenCalledTimes(1)
  })

  it("ignores the click a real pointer sends after its own tap (detail 1), so a tap counts once", () => {
    const alFirmar = vi.fn()
    render(<DeslizarParaAprobar habilitado alFirmar={alFirmar} />)
    fireEvent.click(pista(), { detail: 1 })
    expect(pista()).toHaveAttribute("aria-valuetext", "Sin firmar")
    tocar()
    act(() => {
      vi.advanceTimersByTime(500)
    })
    fireEvent.click(pista(), { detail: 1 })
    expect(alFirmar).not.toHaveBeenCalled()
    expect(pista()).toHaveAttribute("aria-valuetext", "Toca otra vez para firmar")
  })

  it("arms on a tap: the thumb goes to the end and the label says to tap again", () => {
    const alFirmar = vi.fn()
    render(<DeslizarParaAprobar habilitado alFirmar={alFirmar} />)
    tocar()
    expect(alFirmar).not.toHaveBeenCalled()
    expect(pista()).toHaveAttribute("aria-valuenow", "100")
    expect(pista()).toHaveAttribute("aria-valuetext", "Toca otra vez para firmar")
    expect(pista()).toHaveTextContent("Toca otra vez para firmar")
  })

  it("signs on a second tap between 400 ms and 4 s", () => {
    const alFirmar = vi.fn()
    render(<DeslizarParaAprobar habilitado alFirmar={alFirmar} />)
    tocar()
    act(() => {
      vi.advanceTimersByTime(500)
    })
    tocar()
    expect(alFirmar).toHaveBeenCalledTimes(1)
  })

  it("ignores a second tap under 400 ms and still signs on a later one", () => {
    const alFirmar = vi.fn()
    render(<DeslizarParaAprobar habilitado alFirmar={alFirmar} />)
    tocar()
    act(() => {
      vi.advanceTimersByTime(200)
    })
    tocar()
    expect(alFirmar).not.toHaveBeenCalled()
    expect(pista()).toHaveAttribute("aria-valuetext", "Toca otra vez para firmar")
    act(() => {
      vi.advanceTimersByTime(300)
    })
    tocar()
    expect(alFirmar).toHaveBeenCalledTimes(1)
  })

  it("disarms after 4 s, and the next tap arms again instead of signing", () => {
    const alFirmar = vi.fn()
    render(<DeslizarParaAprobar habilitado alFirmar={alFirmar} />)
    tocar()
    act(() => {
      vi.advanceTimersByTime(4000)
    })
    expect(pista()).toHaveAttribute("aria-valuetext", "Sin firmar")
    expect(pista()).toHaveAttribute("aria-valuenow", "0")
    tocar()
    expect(alFirmar).not.toHaveBeenCalled()
    expect(pista()).toHaveAttribute("aria-valuetext", "Toca otra vez para firmar")
  })
})

describe("DeslizarParaAprobar: keyboard", () => {
  it.each(["Enter", " ", "End"])("signs at once with %j", (tecla) => {
    const alFirmar = vi.fn()
    render(<DeslizarParaAprobar habilitado alFirmar={alFirmar} />)
    fireEvent.keyDown(pista(), { key: tecla })
    expect(alFirmar).toHaveBeenCalledTimes(1)
  })

  it("arms with ArrowUp and signs on the second press", () => {
    const alFirmar = vi.fn()
    render(<DeslizarParaAprobar habilitado alFirmar={alFirmar} />)
    fireEvent.keyDown(pista(), { key: "ArrowUp" })
    expect(pista()).toHaveAttribute("aria-valuetext", "Toca otra vez para firmar")
    act(() => {
      vi.advanceTimersByTime(500)
    })
    fireEvent.keyDown(pista(), { key: "ArrowRight" })
    expect(alFirmar).toHaveBeenCalledTimes(1)
  })

  it("disarms with Escape", () => {
    const alFirmar = vi.fn()
    render(<DeslizarParaAprobar habilitado alFirmar={alFirmar} />)
    fireEvent.keyDown(pista(), { key: "ArrowUp" })
    fireEvent.keyDown(pista(), { key: "Escape" })
    expect(pista()).toHaveAttribute("aria-valuetext", "Sin firmar")
    expect(alFirmar).not.toHaveBeenCalled()
  })
})

describe("DeslizarParaAprobar: closed, sending, described", () => {
  it("never arms or signs while disabled, and says so to assistive technology", () => {
    const alFirmar = vi.fn()
    render(<DeslizarParaAprobar habilitado={false} alFirmar={alFirmar} />)
    tocar()
    fireEvent.keyDown(pista(), { key: "Enter" })
    arrastrar(300)
    expect(alFirmar).not.toHaveBeenCalled()
    expect(pista()).toHaveAttribute("aria-disabled", "true")
    expect(pista()).toHaveAttribute("aria-valuetext", "Sin firmar")
  })

  it("shows a lock on a flat thumb while closed, hidden from assistive technology, and reads the reason", () => {
    render(
      <>
        <p id="falta">Falta: escuchar tu voz</p>
        <DeslizarParaAprobar habilitado={false} describidoPor="falta" alFirmar={vi.fn()} />
      </>,
    )
    expect(pista()).toHaveAccessibleDescription(/^Falta: escuchar tu voz/)
    expect(pulgar()).toHaveClass("bg-piedra")
    expect(pulgar().className).not.toMatch(/\bshadow-relieve/)
    const candado = pulgar().querySelector("svg")
    expect(candado).toHaveAttribute("data-icono", "candado")
    expect(candado).toHaveAttribute("aria-hidden", "true")
  })

  it("shows the arrow once it opens", () => {
    render(<DeslizarParaAprobar habilitado alFirmar={vi.fn()} />)
    expect(pulgar().querySelector("svg")).toHaveAttribute("data-icono", "flecha")
  })

  it("goes back to rest when the signature did not go through", () => {
    const { rerender } = render(<DeslizarParaAprobar habilitado enviando={false} alFirmar={vi.fn()} />)
    arrastrar(300)
    rerender(<DeslizarParaAprobar habilitado enviando alFirmar={vi.fn()} />)
    expect(pista()).toHaveAttribute("aria-valuenow", "100")
    rerender(<DeslizarParaAprobar habilitado enviando={false} alFirmar={vi.fn()} />)
    expect(pista()).toHaveAttribute("aria-valuenow", "0")
    expect(pista()).toHaveAttribute("aria-valuetext", "Sin firmar")
  })

  it("offers no second control: there is no Aprobar button", () => {
    render(<DeslizarParaAprobar habilitado alFirmar={vi.fn()} />)
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("is described by what the bar says and by how to sign without dragging", () => {
    render(
      <>
        <p id="consecuencia">Graba el video · 8 s para deshacer</p>
        <DeslizarParaAprobar habilitado describidoPor="consecuencia" alFirmar={vi.fn()} />
      </>,
    )
    expect(pista()).toHaveAccessibleDescription(
      "Graba el video · 8 s para deshacer Enter o Espacio firman. También puedes tocar dos veces: la primera prepara la firma.",
    )
  })

  it("keeps the signature colour on the thumb only", () => {
    render(<DeslizarParaAprobar habilitado alFirmar={vi.fn()} />)
    expect(pulgar()).toHaveClass("bg-firma")
    expect(pista()).toHaveClass("bg-piedra-honda", "shadow-hundido")
    expect(pista().className).not.toMatch(/\bbg-firma\b/)
  })
})
