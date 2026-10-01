import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { Boton } from "@/components/ui/boton"

describe("Boton", () => {
  it("is 52 px tall and has its text as accessible name when primary", () => {
    render(<Boton>Entrar</Boton>)

    const boton = screen.getByRole("button", { name: "Entrar" })

    expect(boton).toHaveClass("min-h-13")
  })

  it("keeps the 44 px touch target when small", () => {
    render(<Boton tamano="chico">Después</Boton>)

    expect(screen.getByRole("button", { name: "Después" })).toHaveClass("min-h-11")
  })

  it("calls onClick when enabled", () => {
    const alTocar = vi.fn()
    render(<Boton onClick={alTocar}>Usar esta</Boton>)

    fireEvent.click(screen.getByRole("button", { name: "Usar esta" }))

    expect(alTocar).toHaveBeenCalledTimes(1)
  })

  it("ignores clicks but stays focusable when disabled, so a screen reader still finds it", () => {
    const alTocar = vi.fn()
    render(
      <Boton deshabilitado onClick={alTocar}>
        Aprobar
      </Boton>,
    )

    const boton = screen.getByRole("button", { name: "Aprobar" })
    fireEvent.click(boton)

    expect(alTocar).not.toHaveBeenCalled()
    expect(boton).toHaveAttribute("aria-disabled", "true")
    expect(boton).not.toBeDisabled()
  })

  it("does not submit a form while loading", () => {
    const alEnviar = vi.fn((evento: { preventDefault: () => void }) => evento.preventDefault())
    render(
      <form onSubmit={alEnviar}>
        <Boton type="submit" cargando>
          Entrar
        </Boton>
      </form>,
    )

    fireEvent.click(screen.getByRole("button", { name: "Entrar" }))

    expect(alEnviar).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Entrar" })).toHaveAttribute("aria-busy", "true")
  })
})
