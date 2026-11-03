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

  it("is a segmented control: a sunken track and the current option raised", () => {
    render(
      <Pestanas
        etiqueta="Vistas"
        actual="mes"
        opciones={[
          { valor: "mes", etiqueta: "Mes", href: "/calendario?vista=mes" },
          { valor: "agenda", etiqueta: "Agenda", href: "/calendario?vista=agenda" },
        ]}
      />,
    )
    expect(screen.getByRole("list")).toHaveClass("bg-piedra-honda", "shadow-hundido", "rounded-control")
    expect(screen.getByRole("link", { name: "Mes" })).toHaveClass("bg-piedra", "shadow-relieve", "min-h-objetivo")
    expect(screen.getByRole("link", { name: "Agenda" })).toHaveClass("text-apagado")
    expect(screen.getByRole("link", { name: "Agenda" }).className).not.toMatch(/shadow-relieve/)
  })

  it("stretches its options across the track by default", () => {
    render(
      <Pestanas
        etiqueta="Vistas"
        actual="mes"
        opciones={[{ valor: "mes", etiqueta: "Mes", href: "/calendario?vista=mes" }]}
      />,
    )
    expect(screen.getByRole("list")).toHaveClass("flex")
    expect(screen.getByRole("listitem")).toHaveClass("flex-1")
  })

  it("hugs its options when compacta, so a single tab does not stretch", () => {
    render(
      <Pestanas
        etiqueta="Secciones"
        actual="materiales"
        compacta
        opciones={[{ valor: "materiales", etiqueta: "Materiales", href: "/biblioteca" }]}
      />,
    )
    expect(screen.getByRole("list")).toHaveClass("inline-flex", "w-fit")
    expect(screen.getByRole("listitem")).toHaveClass("flex-none")
    expect(screen.getByRole("listitem")).not.toHaveClass("flex-1")
  })
})
