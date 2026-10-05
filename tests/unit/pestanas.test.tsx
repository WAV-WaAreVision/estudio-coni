import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Pestanas } from "@/components/ui/pestanas"

describe("Pestanas", () => {
  it("are links and the current one carries aria-current", () => {
    render(
      <Pestanas
        etiqueta="Vistas"
        actual="agenda"
        opciones={[
          { valor: "mes", etiqueta: "Mes", href: "/calendario?vista=mes" },
          { valor: "agenda", etiqueta: "Agenda", href: "/calendario?vista=agenda" },
        ]}
      />,
    )
    expect(screen.getByRole("navigation", { name: "Vistas" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Agenda" })).toHaveAttribute("aria-current", "page")
    expect(screen.getByRole("link", { name: "Mes" })).not.toHaveAttribute("aria-current")
  })
})
