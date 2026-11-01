import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { LineaDeSaldo } from "@/components/ui/costo"

describe("costo", () => {
  it("keeps the balance explanation with its figure, left aligned, never centred", () => {
    render(<LineaDeSaldo>ElevenLabs: te quedan 99.000 de 100.000 caracteres.</LineaDeSaldo>)
    expect(screen.getByText(/te quedan/)).not.toHaveClass("text-center")
  })
})
