import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { MenuDeSecciones } from "@/components/ui/menu-de-secciones"

function dibujarMenu() {
  render(
    <>
      <MenuDeSecciones
        etiqueta="Secciones"
        nombreDelBoton="Sección"
        actual="semana"
        opciones={[
          { valor: "materiales", etiqueta: "Materiales", href: "/biblioteca" },
          { valor: "semana", etiqueta: "Semana", href: "/biblioteca/semana" },
        ]}
      />
      <button type="button">Después del menú</button>
    </>,
  )
  const boton = screen.getByRole("button", { name: "Sección: Semana" })
  fireEvent.click(boton)
  expect(boton).toHaveAttribute("aria-expanded", "true")
  return boton
}

describe("MenuDeSecciones", () => {
  it("closes on Escape when the focus is on the body, as Safari leaves it after a tap", () => {
    const boton = dibujarMenu()
    document.body.focus()
    fireEvent.keyDown(document.body, { key: "Escape" })
    expect(boton).toHaveAttribute("aria-expanded", "false")
    expect(boton).toHaveFocus()
  })

  it("closes when Tab leaves the last section for the next focusable element", () => {
    const boton = dibujarMenu()
    const ultima = screen.getByRole("link", { name: "Semana" })
    fireEvent.focusOut(ultima, { relatedTarget: screen.getByRole("button", { name: "Después del menú" }) })
    expect(boton).toHaveAttribute("aria-expanded", "false")
  })

  it("stays open while the focus moves between its own sections", () => {
    const boton = dibujarMenu()
    fireEvent.focusOut(boton, { relatedTarget: screen.getByRole("link", { name: "Materiales" }) })
    expect(boton).toHaveAttribute("aria-expanded", "true")
  })
})
