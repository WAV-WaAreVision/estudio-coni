import { fireEvent, render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push, refresh: vi.fn() }) }))

import { FormularioDeFiltros } from "@/app/(app)/biblioteca/formulario-de-filtros"
import { MasFiltrosDeTemas } from "@/app/(app)/biblioteca/temas/mas-filtros-de-temas"

const PILAR = "11111111-2222-4333-8444-555555555555"

beforeEach(() => vi.clearAllMocks())

describe("MasFiltrosDeTemas", () => {
  it("folds «Ya los traté» and «Un solo autor» as links with their counts, no zeros, keeping network and pillar", () => {
    const { container } = render(
      <MasFiltrosDeTemas
        filtros={{ red: "instagram", pilar: PILAR, sinTratar: true }}
        conteos={{ sinTratar: 2, tratados: 0, unAutor: 1 }}
      />,
    )
    expect(screen.getByText("Más filtros")).toBeInTheDocument()
    expect(container.querySelector("details")).not.toHaveAttribute("open")
    const lista = screen.getByRole("list", { name: "Más filtros de temas" })
    expect(
      within(lista)
        .getAllByRole("link")
        .map((enlace) => enlace.textContent),
    ).toEqual(["Ya los traté", "Un solo autor · 1"])
    // «Ya los traté» is the opposite of «Sin tratar» in the same network: choosing it clears the other.
    expect(within(lista).getByRole("link", { name: "Ya los traté" })).toHaveAttribute(
      "href",
      `/biblioteca/temas?red=instagram&pilar=${PILAR}&tratados=1`,
    )
    expect(within(lista).getByRole("link", { name: "Un solo autor · 1" })).toHaveAttribute(
      "href",
      `/biblioteca/temas?red=instagram&pilar=${PILAR}&sin-tratar=1&un-autor=1`,
    )
    expect(screen.queryByRole("combobox")).toBeNull()
  })

  it("with a switch on comes open, says how many, marks it and takes it out in one tap", () => {
    const { container } = render(
      <MasFiltrosDeTemas
        filtros={{ red: "linkedin", unAutor: true }}
        conteos={{ sinTratar: 2, tratados: 1, unAutor: 2 }}
      />,
    )
    expect(screen.getByText("Más filtros · 1")).toBeInTheDocument()
    expect(container.querySelector("details")).toHaveAttribute("open")
    const solo = screen.getByRole("link", { name: "Un solo autor · 2" })
    expect(solo).toHaveAttribute("aria-current", "page")
    expect(solo).toHaveAttribute("href", "/biblioteca/temas?red=linkedin")
    expect(screen.getByRole("link", { name: "Ya los traté · 1" })).not.toHaveAttribute("aria-current")
  })
})

describe("FormularioDeFiltros", () => {
  it("sends Materiales' filters to Materiales' own address", () => {
    const { container } = render(
      <FormularioDeFiltros>
        <input type="hidden" name="estado" value="listo" />
      </FormularioDeFiltros>,
    )
    const formulario = container.querySelector("form")
    if (!formulario) throw new Error("Falta el formulario")
    expect(formulario).toHaveAttribute("action", "/biblioteca")
    fireEvent.submit(formulario)
    expect(push).toHaveBeenCalledWith("/biblioteca?estado=listo", { scroll: false })
  })
})
