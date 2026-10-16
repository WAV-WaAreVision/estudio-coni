import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { CLASES_DE_VOLVER, Volver } from "@/components/ui/volver"

describe("Volver", () => {
  it("is a raised pill link with a 2.75rem target that sinks when pressed", () => {
    render(<Volver href="/">Inicio</Volver>)
    const enlace = screen.getByRole("link", { name: "Inicio" })
    expect(enlace).toHaveAttribute("href", "/")
    expect(enlace).toHaveClass(
      "min-h-objetivo",
      "rounded-control",
      "bg-piedra",
      "shadow-relieve",
      "active:shadow-hundido",
    )
    expect(enlace.querySelector("svg")).toHaveAttribute("aria-hidden", "true")
  })

  it("shares its classes with a back button that is not a link", () => {
    expect(CLASES_DE_VOLVER).toContain("shadow-relieve")
  })
})
