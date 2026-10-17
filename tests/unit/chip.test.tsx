import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Chip } from "@/components/chip"

describe("Chip", () => {
  it("is a raised 2.75rem pill; pressed fills with ink and shows a check, never the signature colour", () => {
    render(<Chip presionado>Pareja</Chip>)
    const chip = screen.getByRole("button", { name: "Pareja" })
    expect(chip).toHaveAttribute("aria-pressed", "true")
    expect(chip).toHaveClass(
      "min-h-objetivo",
      "rounded-control",
      "bg-piedra",
      "shadow-relieve",
      "aria-pressed:bg-tinta",
    )
    expect(chip.querySelector("svg")).not.toBeNull()
    expect(chip.className).not.toMatch(/firma/)
  })

  it("shows no check when not pressed, or when the row has no room for it", () => {
    const { rerender } = render(<Chip presionado={false}>Pareja</Chip>)
    expect(screen.getByRole("button", { name: "Pareja" }).querySelector("svg")).toBeNull()
    rerender(
      <Chip presionado conCheck={false}>
        L
      </Chip>,
    )
    expect(screen.getByRole("button", { name: "L" }).querySelector("svg")).toBeNull()
  })
})
