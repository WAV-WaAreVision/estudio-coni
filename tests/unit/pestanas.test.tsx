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

describe("Pestanas compactas", () => {
  it("wrap instead of pushing the page sideways, with a tighter tab, and the shared ones keep theirs", () => {
    const opciones = [
      { valor: "a", etiqueta: "Una", href: "/a" },
      { valor: "b", etiqueta: "Otra", href: "/b" },
    ]
    const { unmount } = render(<Pestanas etiqueta="Secciones" actual="a" compacta opciones={opciones} />)
    expect(screen.getByRole("list")).toHaveClass("flex-wrap", "max-w-full")
    expect(screen.getAllByRole("link")[0]).toHaveClass("gap-1.5", "px-2.5")
    unmount()
    render(<Pestanas etiqueta="Vistas" actual="a" opciones={opciones} />)
    expect(screen.getByRole("list")).not.toHaveClass("flex-wrap")
    expect(screen.getAllByRole("link")[0]).toHaveClass("gap-2", "px-3")
  })
})
