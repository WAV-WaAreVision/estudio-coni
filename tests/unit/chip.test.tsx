import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Chip } from "@/components/chip"

describe("Chip", () => {
  it("is a 44 px toggle; pressed fills with ink, never the signature colour", () => {
    render(<Chip presionado>Pareja</Chip>)
    const chip = screen.getByRole("button", { name: "Pareja" })
    expect(chip).toHaveAttribute("aria-pressed", "true")
    expect(chip).toHaveClass("min-h-11", "aria-pressed:bg-tinta")
    expect(chip.className).not.toMatch(/firma|acento/)
  })
})
