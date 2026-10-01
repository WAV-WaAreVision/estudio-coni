import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { PildoraPilar } from "@/components/ui/pildora-pilar"

describe("PildoraPilar", () => {
  it("names the pillar in words, so colour is never the only signal", () => {
    render(<PildoraPilar pilar="deseo" />)

    expect(screen.getByText("Deseo y sexualidad")).toBeInTheDocument()
  })

  it("marks the pillar for the tint tokens", () => {
    render(<PildoraPilar pilar="limites" />)

    expect(screen.getByText("Género y límites")).toHaveAttribute("data-pilar", "limites")
  })
})
