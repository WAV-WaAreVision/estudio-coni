import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Wordmark } from "@/components/ui/wordmark"

describe("Wordmark", () => {
  it("reads as Conidolly and draws the dot of the i in the signature", () => {
    render(<Wordmark />)
    expect(screen.getByRole("img", { name: "Conidolly" })).toBeInTheDocument()
    expect(document.querySelector("[data-punto]")).toHaveClass("fill-firma")
  })

  it("uses the dotless i so the signature dot is the only dot", () => {
    render(<Wordmark />)
    expect(document.querySelector("text")?.textContent).toBe("conıdolly")
  })
})
