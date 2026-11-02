import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { PildoraDeEstado } from "@/components/ui/estado"
import { Pestanas } from "@/components/ui/pestanas"

describe("PildoraDeEstado with an icon of its own (4j)", () => {
  it("draws the icon it is given on a neutral pill, which had none", () => {
    render(
      <PildoraDeEstado tipo="neutro" icono={<svg data-testid="reloj" />}>
        Procesando
      </PildoraDeEstado>,
    )
    const pildora = screen.getByText("Procesando").parentElement
    expect(pildora?.querySelector("[data-testid=reloj]")).not.toBeNull()
    expect(pildora).toHaveClass("bg-piedra-alta")
  })

  it("uses it instead of the warning of an aviso pill, never both", () => {
    render(
      <PildoraDeEstado tipo="aviso" icono={<svg data-testid="mano" />}>
        Espera tu OK
      </PildoraDeEstado>,
    )
    const pildora = screen.getByText("Espera tu OK").parentElement
    expect(pildora?.querySelectorAll("svg")).toHaveLength(1)
    expect(pildora?.querySelector("[data-testid=mano]")).not.toBeNull()
  })
})

describe("Pestanas with icons (4c)", () => {
  it("puts the icon before the name and keeps the name as the link's name", () => {
    render(
      <Pestanas
        etiqueta="Secciones de la Biblioteca"
        actual="materiales"
        opciones={[
          { valor: "materiales", etiqueta: "Materiales", href: "/biblioteca", icono: <svg data-testid="icono" /> },
        ]}
      />,
    )
    const enlace = screen.getByRole("link", { name: "Materiales" })
    expect(enlace).toHaveAttribute("aria-current", "page")
    expect(enlace.querySelector("[data-testid=icono]")).not.toBeNull()
  })
})
