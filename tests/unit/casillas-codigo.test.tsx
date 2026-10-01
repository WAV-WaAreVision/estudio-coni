import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { CasillasCodigo } from "@/components/casillas-codigo"

function casillas(): HTMLInputElement[] {
  return screen.getAllByRole<HTMLInputElement>("textbox")
}

function pegar(casilla: HTMLElement, texto: string) {
  fireEvent.paste(casilla, { clipboardData: { getData: () => texto } })
}

describe("CasillasCodigo", () => {
  it("has six boxes with a numeric keyboard, and only the first one asks for the emailed code", () => {
    render(<CasillasCodigo alCompletar={() => undefined} />)

    expect(casillas()).toHaveLength(6)
    for (const casilla of casillas()) expect(casilla).toHaveAttribute("inputmode", "numeric")
    expect(casillas()[0]).toHaveAttribute("autocomplete", "one-time-code")
    expect(casillas()[1]).toHaveAttribute("autocomplete", "off")
  })

  it("moves to the next box after a digit", () => {
    render(<CasillasCodigo alCompletar={() => undefined} />)

    fireEvent.change(casillas()[0], { target: { value: "4" } })

    expect(casillas()[0]).toHaveValue("4")
    expect(casillas()[1]).toHaveFocus()
  })

  it("ignores anything that is not a digit", () => {
    render(<CasillasCodigo alCompletar={() => undefined} />)

    fireEvent.change(casillas()[0], { target: { value: "a" } })

    expect(casillas()[0]).toHaveValue("")
  })

  it("fills all six boxes when the whole code is pasted, and reports it once", () => {
    const alCompletar = vi.fn()
    render(<CasillasCodigo alCompletar={alCompletar} />)

    pegar(casillas()[0], "123456")

    expect(
      casillas()
        .map((c) => c.value)
        .join(""),
    ).toBe("123456")
    expect(alCompletar).toHaveBeenCalledTimes(1)
    expect(alCompletar).toHaveBeenCalledWith("123456")
  })

  it("cleans spaces and dashes of a pasted code", () => {
    const alCompletar = vi.fn()
    render(<CasillasCodigo alCompletar={alCompletar} />)

    pegar(casillas()[0], " 123-456 ")

    expect(alCompletar).toHaveBeenCalledWith("123456")
  })

  it("fills the whole code when the phone autofills it into the first box", () => {
    const alCompletar = vi.fn()
    render(<CasillasCodigo alCompletar={alCompletar} />)

    fireEvent.change(casillas()[0], { target: { value: "654321" } })

    expect(alCompletar).toHaveBeenCalledWith("654321")
  })

  it("stays on the next empty box when only part of the code is pasted", () => {
    const alCompletar = vi.fn()
    render(<CasillasCodigo alCompletar={alCompletar} />)

    pegar(casillas()[0], "123")

    expect(
      casillas()
        .map((c) => c.value)
        .join(""),
    ).toBe("123")
    expect(casillas()[3]).toHaveFocus()
    expect(alCompletar).not.toHaveBeenCalled()
  })

  it("goes back and clears the previous box on Backspace in an empty box", () => {
    render(<CasillasCodigo alCompletar={() => undefined} />)
    pegar(casillas()[0], "12")

    fireEvent.keyDown(casillas()[2], { key: "Backspace" })

    expect(casillas()[1]).toHaveValue("")
    expect(casillas()[1]).toHaveFocus()
    expect(casillas()[0]).toHaveValue("1")
  })

  it("replaces the digit of a box that already had one", () => {
    render(<CasillasCodigo alCompletar={() => undefined} />)
    pegar(casillas()[0], "12")

    fireEvent.change(casillas()[1], { target: { value: "9" } })

    expect(casillas()[1]).toHaveValue("9")
  })

  it("marks the boxes invalid when the parent says the code was wrong", () => {
    render(<CasillasCodigo alCompletar={() => undefined} invalido />)

    for (const casilla of casillas()) expect(casilla).toHaveAttribute("aria-invalid", "true")
  })
})
