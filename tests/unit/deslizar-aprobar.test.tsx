import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { DeslizarParaAprobar } from "@/components/deslizar-para-aprobar"

const ETIQUETA = "Desliza para aprobar y grabar"

function deslizador() {
  return screen.getByRole("slider", { name: ETIQUETA })
}

function mover(valor: number) {
  fireEvent.change(deslizador(), { target: { value: String(valor) } })
}

describe("DeslizarParaAprobar", () => {
  it("starts as not approved", () => {
    render(<DeslizarParaAprobar etiqueta={ETIQUETA} habilitado alAprobar={vi.fn()} />)

    expect(deslizador()).toHaveAttribute("aria-valuetext", "No aprobado")
    expect(deslizador()).toHaveValue("0")
  })

  it("approves once it reaches 96 percent", () => {
    const alAprobar = vi.fn()
    render(<DeslizarParaAprobar etiqueta={ETIQUETA} habilitado alAprobar={alAprobar} />)

    mover(96)

    expect(alAprobar).toHaveBeenCalledTimes(1)
    expect(deslizador()).toHaveAttribute("aria-valuetext", "Aprobado")
  })

  it("does not approve before 96 percent, and goes back to zero when she lets go", () => {
    const alAprobar = vi.fn()
    render(<DeslizarParaAprobar etiqueta={ETIQUETA} habilitado alAprobar={alAprobar} />)

    mover(80)
    fireEvent.pointerUp(deslizador())

    expect(alAprobar).not.toHaveBeenCalled()
    expect(deslizador()).toHaveValue("0")
  })

  it("approves only once even if the thumb keeps reporting values at the end", () => {
    const alAprobar = vi.fn()
    render(<DeslizarParaAprobar etiqueta={ETIQUETA} habilitado alAprobar={alAprobar} />)

    mover(96)
    mover(100)

    expect(alAprobar).toHaveBeenCalledTimes(1)
  })

  it("ignores the slide while it is not enabled, and says why", () => {
    const alAprobar = vi.fn()
    render(
      <DeslizarParaAprobar
        etiqueta={ETIQUETA}
        habilitado={false}
        motivo="Falta escuchar la voz y confirmar la revisión."
        alAprobar={alAprobar}
      />,
    )

    mover(100)

    expect(alAprobar).not.toHaveBeenCalled()
    expect(deslizador()).toHaveValue("0")
    expect(deslizador()).toHaveAttribute("aria-disabled", "true")
    expect(deslizador()).toHaveAccessibleDescription("Falta escuchar la voz y confirmar la revisión.")
  })

  it("approves with the End key, the keyboard way", () => {
    const alAprobar = vi.fn()
    render(<DeslizarParaAprobar etiqueta={ETIQUETA} habilitado alAprobar={alAprobar} />)

    fireEvent.keyDown(deslizador(), { key: "End" })

    expect(alAprobar).toHaveBeenCalledTimes(1)
  })

  it("does not approve with End while it is not enabled", () => {
    const alAprobar = vi.fn()
    render(<DeslizarParaAprobar etiqueta={ETIQUETA} habilitado={false} alAprobar={alAprobar} />)

    fireEvent.keyDown(deslizador(), { key: "End" })

    expect(alAprobar).not.toHaveBeenCalled()
  })

  it("goes back to zero when the approval did not go through", () => {
    const { rerender } = render(
      <DeslizarParaAprobar etiqueta={ETIQUETA} habilitado enviando={false} alAprobar={vi.fn()} />,
    )
    mover(100)
    rerender(<DeslizarParaAprobar etiqueta={ETIQUETA} habilitado enviando alAprobar={vi.fn()} />)
    expect(deslizador()).toHaveValue("100")

    rerender(<DeslizarParaAprobar etiqueta={ETIQUETA} habilitado enviando={false} alAprobar={vi.fn()} />)

    expect(deslizador()).toHaveValue("0")
  })
})
