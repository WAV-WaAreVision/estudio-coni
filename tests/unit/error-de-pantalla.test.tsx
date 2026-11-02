import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import ErrorDePantalla from "@/app/(app)/error"

describe("ErrorDePantalla", () => {
  it("says it as one error block, with the way forward as a secondary button", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const reset = vi.fn()
    const unstable_retry = vi.fn()
    render(<ErrorDePantalla error={new Error("boom")} reset={reset} unstable_retry={unstable_retry} />)

    const alerta = screen.getByRole("alert")
    expect(alerta).toHaveTextContent("No pude cargar esta pantalla.")
    expect(alerta).toHaveClass("bg-piedra-honda")
    expect(alerta.className).not.toMatch(/\bbg-(error|firma)\b/)
    fireEvent.click(screen.getByRole("button", { name: "Intentar de nuevo" }))
    // reset() alone re-renders without fetching again, so a failed server read would show the same error.
    expect(unstable_retry).toHaveBeenCalledTimes(1)
    expect(reset).not.toHaveBeenCalled()
  })
})
