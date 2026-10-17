import { fireEvent, render, screen } from "@testing-library/react"
import { createRef } from "react"
import { describe, expect, it, vi } from "vitest"
import { Boton } from "@/components/ui/boton"
import { clasesDeBoton } from "@/components/ui/clases-de-boton"

describe("Boton", () => {
  it("is a raised ink pill 3.25rem tall with its label at button size when primary", () => {
    render(<Boton>Entrar</Boton>)
    expect(screen.getByRole("button", { name: "Entrar" })).toHaveClass(
      "min-h-boton",
      "text-boton",
      "rounded-control",
      "bg-tinta",
      "text-luz",
      "shadow-relieve",
    )
  })

  it("keeps a 2.75rem target when small", () => {
    render(<Boton tamano="chico">Después</Boton>)
    expect(screen.getByRole("button", { name: "Después" })).toHaveClass("min-h-objetivo", "text-cuerpo")
  })

  it("sinks when pressed instead of shrinking (The Press Sinks Rule)", () => {
    render(<Boton variante="secundario">Cambiar</Boton>)
    const boton = screen.getByRole("button", { name: "Cambiar" })
    expect(boton).toHaveClass("bg-piedra", "shadow-relieve", "active:shadow-hundido")
    expect(boton.className).not.toMatch(/scale/)
  })

  it("draws the quiet action as underlined text on a 2.75rem row, with no surface", () => {
    render(<Boton variante="callado">Volver a la versión de Claude</Boton>)
    const boton = screen.getByRole("button", { name: "Volver a la versión de Claude" })
    expect(boton).toHaveClass("underline", "min-h-objetivo", "px-0")
    expect(boton.className).not.toMatch(/\bbg-|shadow-relieve/)
  })

  it("draws the destructive confirm raised, with the error label, never filled with colour", () => {
    render(<Boton variante="destructiva">Sí, desconectar</Boton>)
    const boton = screen.getByRole("button", { name: "Sí, desconectar" })
    expect(boton).toHaveClass("bg-piedra", "text-error", "shadow-relieve")
    expect(boton.className).not.toMatch(/\bbg-(tinta|firma|error)\b/)
  })

  it("calls onClick when enabled", () => {
    const alTocar = vi.fn()
    render(<Boton onClick={alTocar}>Usar esta</Boton>)
    fireEvent.click(screen.getByRole("button", { name: "Usar esta" }))
    expect(alTocar).toHaveBeenCalledTimes(1)
  })

  it("ignores clicks but stays focusable when disabled, flat on honda", () => {
    const alTocar = vi.fn()
    render(
      <Boton deshabilitado onClick={alTocar}>
        Preparar mi voz
      </Boton>,
    )
    const boton = screen.getByRole("button", { name: "Preparar mi voz" })
    fireEvent.click(boton)
    expect(alTocar).not.toHaveBeenCalled()
    expect(boton).toHaveAttribute("aria-disabled", "true")
    expect(boton).not.toBeDisabled()
    expect(boton).toHaveClass("aria-disabled:bg-piedra-honda", "aria-disabled:shadow-none")
  })

  // An invariant of clases-de-boton, true before the round that muted the disabled labels: the guards of that fix are
  // ui-aviso and descartar-idea, whose controls did not mute theirs.
  it("keeps the label of a disabled button muted in every kind, not only its shadow", () => {
    for (const variante of ["primario", "secundario", "callado", "destructiva"] as const) {
      const { unmount } = render(
        <Boton variante={variante} deshabilitado>
          Entrar
        </Boton>,
      )
      const boton = screen.getByRole("button", { name: "Entrar" })
      expect(boton).toHaveAttribute("aria-disabled", "true")
      expect(boton).toHaveClass("aria-disabled:text-apagado")
      unmount()
    }
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

  it("puts the label on the left and the icon that says what happens on the right", () => {
    render(<Boton icono={<span data-testid="icono" />}>Grabar video</Boton>)
    const boton = screen.getByRole("button", { name: "Grabar video" })
    expect(boton).toHaveClass("justify-between")
    expect(boton.lastElementChild).toBe(screen.getByTestId("icono"))
  })

  it("swaps the icon for the working dot while loading", () => {
    render(
      <Boton cargando icono={<span data-testid="icono" />}>
        Guardando…
      </Boton>,
    )
    expect(screen.queryByTestId("icono")).toBeNull()
    expect(screen.getByRole("button", { name: "Guardando…" }).querySelector(".punto-trabajando")).not.toBeNull()
  })

  it("shows the price on the right, light on the primary and apagado elsewhere or when disabled", () => {
    const { rerender } = render(<Boton precio="US$ 0,33">Preparar mi voz</Boton>)
    expect(screen.getByText("US$ 0,33")).toHaveClass("text-luz", "tabular-nums")
    expect(screen.getByRole("button", { name: "Preparar mi voz US$ 0,33" })).toBeInTheDocument()
    rerender(
      <Boton variante="secundario" tamano="chico" precio="US$ 3,48">
        Regrabar video
      </Boton>,
    )
    expect(screen.getByText("US$ 3,48")).toHaveClass("text-apagado")
    rerender(
      <Boton deshabilitado precio="US$ 0,33">
        Preparar mi voz
      </Boton>,
    )
    expect(screen.getByText("US$ 0,33")).toHaveClass("text-apagado")
  })

  it("hands its ref to the button, so a screen can move focus to it", () => {
    const ref = createRef<HTMLButtonElement>()
    render(<Boton ref={ref}>Deshacer</Boton>)
    expect(ref.current).toBe(screen.getByRole("button", { name: "Deshacer" }))
  })
})

describe("clasesDeBoton", () => {
  it("merges the size and the variant, so a link that looks like a button gets one padding", () => {
    const clases = clasesDeBoton({ variante: "callado", tamano: "chico" }).split(" ")
    expect(clases).toContain("px-0")
    expect(clases).not.toContain("px-[18px]")
  })
})
