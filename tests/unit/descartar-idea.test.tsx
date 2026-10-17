import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { DescartarIdea } from "@/app/(app)/ideas/descartar-idea"

describe("DescartarIdea", () => {
  it("mutes the reasons and ignores a tap while the idea is busy", () => {
    const alElegir = vi.fn()
    render(<DescartarIdea ocupada alElegir={alElegir} />)
    fireEvent.click(screen.getByRole("button", { name: "Descartar" }))
    const motivo = screen.getByRole("button", { name: "Repetida" })
    expect(motivo).toHaveAttribute("aria-disabled", "true")
    expect(motivo).toHaveClass("aria-disabled:text-apagado", "aria-disabled:cursor-not-allowed")
    fireEvent.click(motivo)
    expect(alElegir).not.toHaveBeenCalled()
  })
})
