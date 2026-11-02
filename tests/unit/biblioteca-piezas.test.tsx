import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { EstadoDeMaterial } from "@/app/(app)/biblioteca/estado-de-material"
import { NavDeBiblioteca } from "@/app/(app)/biblioteca/nav-de-biblioteca"
import { TemaDelMaterial } from "@/app/(app)/biblioteca/tema-del-material"

const base = { estado: "procesando", motivo_fallo: null, costo_estimado_usd: null, costo_confirmado_en: null }

describe("NavDeBiblioteca (4c)", () => {
  it("shows only the sections already in Conidolly, each with an icon and its name", () => {
    render(<NavDeBiblioteca actual="materiales" />)
    const nav = screen.getByRole("navigation", { name: "Secciones de la Biblioteca" })
    const enlaces = screen.getAllByRole("link")
    expect(enlaces.map((enlace) => enlace.textContent)).toEqual(["Materiales"])
    expect(enlaces[0]).toHaveAttribute("href", "/biblioteca")
    expect(nav.querySelector("svg")).not.toBeNull()
  })
})

describe("EstadoDeMaterial (4j)", () => {
  it.each([
    [{ ...base }, "Procesando"],
    [{ ...base, motivo_fallo: "tope_mensual" }, "En pausa"],
    [{ ...base, costo_estimado_usd: 1.2 }, "Espera tu OK"],
    [{ ...base, estado: "listo" }, "Listo"],
    [{ ...base, estado: "fallido" }, "Con error"],
  ])("draws %j as an icon and «%s»", (material, palabra) => {
    render(<EstadoDeMaterial material={material} />)
    const pildora = screen.getByText(palabra).parentElement
    expect(pildora?.querySelectorAll("svg")).toHaveLength(1)
  })

  it("draws an error in the error colour, the only state with a colour of its own", () => {
    render(<EstadoDeMaterial material={{ ...base, estado: "fallido" }} />)
    expect(screen.getByText("Con error").parentElement).toHaveClass("text-error")
  })
})

describe("TemaDelMaterial", () => {
  it("shows +N and reads it in words", () => {
    const { container } = render(<TemaDelMaterial tema={{ nombre: "Carga mental", otros: 2 }} />)
    expect(screen.getByText("Carga mental +2")).toHaveAttribute("aria-hidden", "true")
    expect(screen.getByText("Carga mental y 2 temas más")).toHaveClass("sr-only")
    expect(container.textContent).toContain("Carga mental +2")
  })
})
