import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import ErrorDePantalla from "@/app/(app)/error"

describe("ErrorDePantalla", () => {
  it("says it as one error line, with the way forward as an outlined button", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const reset = vi.fn()
    render(<ErrorDePantalla error={new Error("boom")} reset={reset} />)

    expect(screen.getByRole("alert")).toHaveTextContent("No pude cargar esta pantalla.")
    expect(screen.getByRole("alert").className).not.toMatch(/\bbg-/)
    fireEvent.click(screen.getByRole("button", { name: "Intentar de nuevo" }))
    expect(reset).toHaveBeenCalledTimes(1)
  })
})
