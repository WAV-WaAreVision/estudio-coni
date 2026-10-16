import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { GuionEnLectura } from "@/components/guion-en-lectura"

describe("GuionEnLectura", () => {
  it("draws each tone mark as a honda chip and keeps the text around it", () => {
    render(<GuionEnLectura guion={"[warm] El deseo no se apaga.\n\n[pause] Soy Coni."} />)
    expect(screen.getByText("[warm]")).toHaveClass("bg-piedra-honda", "text-tinta", "rounded-control")
    expect(document.body.textContent).toContain("El deseo no se apaga.")
  })

  it("reads at the script size and keeps the line breaks", () => {
    const { container } = render(<GuionEnLectura guion="Hola." />)
    expect(container.firstElementChild).toHaveClass("text-guion", "whitespace-pre-wrap")
  })

  it("marks a finding's phrase, links it to its review panel and flags it", () => {
    render(
      <GuionEnLectura
        guion="Hoy, casi siempre, nadie. Muchas apps no pasaron por ninguna evaluación."
        frases={["Muchas apps no pasaron"]}
        idDeRevision={(indice) => `revision-${indice}`}
      />,
    )
    const enlace = screen.getByRole("link", { name: "Muchas apps no pasaron" })
    expect(enlace).toHaveAttribute("href", "#revision-0")
    const marca = enlace.closest("mark")
    expect(marca).toHaveAttribute("data-en-linea")
    expect(marca).toHaveClass("bg-piedra-honda", "underline", "decoration-2")
    expect(marca?.nextElementSibling?.tagName.toLowerCase()).toBe("svg")
  })
})
