import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { DeslizarParaAprobar } from "@/components/deslizar-para-aprobar"

const ETIQUETA = "Desliza para aprobar el guion"
const deslizador = () => screen.getByRole("slider", { name: ETIQUETA })

beforeEach(() => {
  // Track 356 px, thumb 48 px, 4 px inset on each side: free travel 300 px.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    width: 356,
    left: 0,
    right: 356,
    top: 0,
    bottom: 56,
    height: 56,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  })
  HTMLElement.prototype.setPointerCapture = vi.fn()
  HTMLElement.prototype.releasePointerCapture = vi.fn()
})

function arrastrar(hasta: number) {
  fireEvent.pointerDown(deslizador(), { pointerId: 1, clientX: 0 })
  fireEvent.pointerMove(deslizador(), { pointerId: 1, clientX: hasta })
  fireEvent.pointerUp(deslizador(), { pointerId: 1, clientX: hasta })
}

describe("DeslizarParaAprobar", () => {
  it("starts as not approved", () => {
    render(<DeslizarParaAprobar etiqueta={ETIQUETA} habilitado alAprobar={vi.fn()} />)
    expect(deslizador()).toHaveAttribute("aria-valuenow", "0")
    expect(deslizador()).toHaveAttribute("aria-valuetext", "No aprobado")
  })

  it("does not approve when the track is tapped, anywhere", () => {
    const alAprobar = vi.fn()
    render(<DeslizarParaAprobar etiqueta={ETIQUETA} habilitado alAprobar={alAprobar} />)
    const pista = screen.getByTestId("pista-deslizador")
    fireEvent.pointerDown(pista, { pointerId: 1, clientX: 350 })
    fireEvent.pointerUp(pista, { pointerId: 1, clientX: 350 })
    fireEvent.click(pista, { clientX: 350 })
    expect(alAprobar).not.toHaveBeenCalled()
  })

  it("does not approve when the thumb is tapped without dragging", () => {
    const alAprobar = vi.fn()
    render(<DeslizarParaAprobar etiqueta={ETIQUETA} habilitado alAprobar={alAprobar} />)
    arrastrar(0)
    expect(alAprobar).not.toHaveBeenCalled()
  })

  it("does not approve while dragging past the end, only on release", () => {
    const alAprobar = vi.fn()
    render(<DeslizarParaAprobar etiqueta={ETIQUETA} habilitado alAprobar={alAprobar} />)
    fireEvent.pointerDown(deslizador(), { pointerId: 1, clientX: 0 })
    fireEvent.pointerMove(deslizador(), { pointerId: 1, clientX: 300 })
    expect(alAprobar).not.toHaveBeenCalled()
    fireEvent.pointerUp(deslizador(), { pointerId: 1, clientX: 300 })
    expect(alAprobar).toHaveBeenCalledTimes(1)
    expect(deslizador()).toHaveAttribute("aria-valuetext", "Aprobado")
  })

  it("springs back when released before 96 percent", () => {
    const alAprobar = vi.fn()
    render(<DeslizarParaAprobar etiqueta={ETIQUETA} habilitado alAprobar={alAprobar} />)
    arrastrar(280) // 93 %
    expect(alAprobar).not.toHaveBeenCalled()
    expect(deslizador()).toHaveAttribute("aria-valuenow", "0")
  })

  it("approves only once", () => {
    const alAprobar = vi.fn()
    render(<DeslizarParaAprobar etiqueta={ETIQUETA} habilitado enviando={false} alAprobar={alAprobar} />)
    arrastrar(300)
    arrastrar(300)
    expect(alAprobar).toHaveBeenCalledTimes(1)
  })

  it("ignores drags and End while disabled, and says why", () => {
    const alAprobar = vi.fn()
    render(
      <DeslizarParaAprobar
        etiqueta={ETIQUETA}
        habilitado={false}
        motivo="Falta confirmar la revisión."
        alAprobar={alAprobar}
      />,
    )
    arrastrar(300)
    fireEvent.keyDown(deslizador(), { key: "End" })
    expect(alAprobar).not.toHaveBeenCalled()
    expect(deslizador()).toHaveAttribute("aria-disabled", "true")
    expect(deslizador()).toHaveAccessibleDescription("Falta confirmar la revisión.")
  })

  it("approves with End and moves with the arrows and Home", () => {
    const alAprobar = vi.fn()
    render(<DeslizarParaAprobar etiqueta={ETIQUETA} habilitado alAprobar={alAprobar} />)
    fireEvent.keyDown(deslizador(), { key: "ArrowRight" })
    expect(deslizador()).toHaveAttribute("aria-valuenow", "4")
    fireEvent.keyDown(deslizador(), { key: "Home" })
    expect(deslizador()).toHaveAttribute("aria-valuenow", "0")
    fireEvent.keyDown(deslizador(), { key: "End" })
    expect(alAprobar).toHaveBeenCalledTimes(1)
  })

  it("never reads as approved just because the arrows walked to the end", () => {
    const alAprobar = vi.fn()
    render(<DeslizarParaAprobar etiqueta={ETIQUETA} habilitado alAprobar={alAprobar} />)
    for (let paso = 0; paso < 40; paso += 1) fireEvent.keyDown(deslizador(), { key: "ArrowRight" })
    expect(alAprobar).not.toHaveBeenCalled()
    expect(deslizador()).toHaveAttribute("aria-valuetext", "No aprobado")
  })

  it("goes back to zero when the approval did not go through", () => {
    const { rerender } = render(
      <DeslizarParaAprobar etiqueta={ETIQUETA} habilitado enviando={false} alAprobar={vi.fn()} />,
    )
    arrastrar(300)
    rerender(<DeslizarParaAprobar etiqueta={ETIQUETA} habilitado enviando alAprobar={vi.fn()} />)
    expect(deslizador()).toHaveAttribute("aria-valuenow", "100")
    rerender(<DeslizarParaAprobar etiqueta={ETIQUETA} habilitado enviando={false} alAprobar={vi.fn()} />)
    expect(deslizador()).toHaveAttribute("aria-valuenow", "0")
  })
})

describe("DeslizarParaAprobar, the visible alternative to dragging (WCAG 2.5.7)", () => {
  it("offers an Aprobar button that approves with a tap, once", () => {
    const alAprobar = vi.fn()
    render(<DeslizarParaAprobar etiqueta={ETIQUETA} habilitado alAprobar={alAprobar} />)
    const boton = screen.getByRole("button", { name: "Aprobar" })
    fireEvent.click(boton)
    fireEvent.click(boton)
    expect(alAprobar).toHaveBeenCalledTimes(1)
    expect(deslizador()).toHaveAttribute("aria-valuetext", "Aprobado")
  })

  it("asks for the same preconditions: disabled, it does nothing and gives the same reason", () => {
    const alAprobar = vi.fn()
    render(
      <DeslizarParaAprobar
        etiqueta={ETIQUETA}
        habilitado={false}
        motivo="Falta confirmar la revisión."
        alAprobar={alAprobar}
      />,
    )
    const boton = screen.getByRole("button", { name: "Aprobar" })
    fireEvent.click(boton)
    expect(alAprobar).not.toHaveBeenCalled()
    expect(boton).toHaveAttribute("aria-disabled", "true")
    expect(boton).toHaveAccessibleDescription("Falta confirmar la revisión.")
  })

  it("does nothing while the approval travels to the server", () => {
    const alAprobar = vi.fn()
    render(<DeslizarParaAprobar etiqueta={ETIQUETA} habilitado enviando alAprobar={alAprobar} />)
    fireEvent.click(screen.getByRole("button", { name: "Aprobar" }))
    expect(alAprobar).not.toHaveBeenCalled()
  })

  it("never uses the signature colour: only the slider carries it", () => {
    render(<DeslizarParaAprobar etiqueta={ETIQUETA} habilitado alAprobar={vi.fn()} />)
    expect(screen.getByRole("button", { name: "Aprobar" }).className).not.toMatch(/firma/)
  })
})
