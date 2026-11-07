import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { EstadoDeMaterial } from "@/app/(app)/biblioteca/estado-de-material"
import { NavDeBiblioteca } from "@/app/(app)/biblioteca/nav-de-biblioteca"
import { TemaDelMaterial } from "@/app/(app)/biblioteca/tema-del-material"

const base = { estado: "procesando", motivo_fallo: null, costo_estimado_usd: null, costo_confirmado_en: null }

describe("NavDeBiblioteca (4c)", () => {
  it("shows the four sections, Semana after Temas, each with an icon and its name", () => {
    render(<NavDeBiblioteca actual="semana" />)
    const nav = screen.getByRole("navigation", { name: "Secciones de la Biblioteca" })
    const enlaces = within(nav).getAllByRole("link")
    expect(enlaces.map((enlace) => enlace.textContent)).toEqual(["Materiales", "Autores", "Temas", "Semana"])
    expect(enlaces.map((enlace) => enlace.getAttribute("href"))).toEqual([
      "/biblioteca",
      "/biblioteca/autores",
      "/biblioteca/temas",
      "/biblioteca/semana",
    ])
    expect(enlaces[3]).toHaveAttribute("aria-current", "page")
    expect(nav.querySelectorAll("svg")).toHaveLength(4)
  })

  it("hugs its tabs and slides them on one row instead of pushing the page sideways", () => {
    render(<NavDeBiblioteca actual="materiales" />)
    expect(screen.getByRole("list")).toHaveClass("w-fit", "max-w-full", "flex-nowrap", "overflow-x-auto")
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
    const { container } = render(<TemaDelMaterial tema={{ id: "t1", nombre: "Carga mental", otros: 2 }} />)
    expect(screen.getByText("Carga mental +2")).toHaveAttribute("aria-hidden", "true")
    expect(screen.getByText("Carga mental y 2 temas más")).toHaveClass("sr-only")
    expect(container.textContent).toContain("Carga mental +2")
    expect(screen.queryByRole("link")).toBeNull()
  })

  it("links to the topic when asked, named in words", () => {
    render(<TemaDelMaterial tema={{ id: "t1", nombre: "Carga mental", otros: 2 }} conEnlace />)
    expect(screen.getByRole("link", { name: "Carga mental y 2 temas más" })).toHaveAttribute(
      "href",
      "/biblioteca/temas/t1",
    )
  })

  it("never links a material without a topic", () => {
    render(<TemaDelMaterial tema={null} conEnlace />)
    expect(screen.queryByRole("link")).toBeNull()
    expect(screen.getAllByText("Sin tema todavía")).toHaveLength(2)
  })
})
