import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { GuionEnLectura } from "@/components/guion-en-lectura"

describe("GuionEnLectura", () => {
  it("draws each tone mark as a chip and keeps the text around it", () => {
    render(<GuionEnLectura guion={"[warm] El deseo no se apaga.\n\n[pause] Soy Coni."} />)
    expect(screen.getByText("[warm]")).toHaveClass("bg-pista", "text-apagado")
    expect(screen.getByText("[pause]")).toHaveClass("bg-pista")
    expect(document.body.textContent).toContain("El deseo no se apaga.")
  })

  it("reads at the script size and keeps the line breaks", () => {
    const { container } = render(<GuionEnLectura guion="Hola." />)
    expect(container.firstElementChild).toHaveClass("text-guion", "whitespace-pre-wrap")
  })
})
