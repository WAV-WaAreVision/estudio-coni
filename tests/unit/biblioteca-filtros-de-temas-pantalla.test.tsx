import { fireEvent, render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push, refresh: vi.fn() }) }))

import { FormularioDeFiltros } from "@/app/(app)/biblioteca/formulario-de-filtros"
import { FiltrosDeCobertura } from "@/app/(app)/biblioteca/temas/filtros-de-cobertura"
import { MasFiltrosDeTemas } from "@/app/(app)/biblioteca/temas/mas-filtros-de-temas"

const PILAR = "11111111-2222-4333-8444-555555555555"
const OTRO = "22222222-2222-4333-8444-555555555555"
const PILARES = [
  { id: PILAR, nombre: "IA y salud mental" },
  { id: OTRO, nombre: "Ética y regulación" },
]
const CONTEOS = { "sin-tratar": 2, tratados: 0, "un-autor": 1 }

beforeEach(() => vi.clearAllMocks())

describe("FiltrosDeCobertura (Coni's option 1)", () => {
  it("offers the four in one tap each, with counts and no zeros, keeping the pillar", () => {
    render(<FiltrosDeCobertura filtros={{ pilar: PILAR }} conteos={CONTEOS} />)
    const grupo = screen.getByRole("group", { name: "Filtrar temas" })
    expect(
      within(grupo)
        .getAllByRole("link")
        .map((enlace) => enlace.textContent),
    ).toEqual(["Todos", "Sin tratar · 2", "Ya los traté", "Un solo autor · 1"])
    expect(within(grupo).getByRole("link", { name: "Sin tratar · 2" })).toHaveAttribute(
      "href",
      `/biblioteca/temas?pilar=${PILAR}&cobertura=sin-tratar`,
    )
    expect(within(grupo).getByRole("link", { name: "Todos" })).toHaveAttribute(
      "href",
      `/biblioteca/temas?pilar=${PILAR}`,
    )
    expect(within(grupo).getByRole("link", { name: "Todos" })).toHaveAttribute("aria-current", "page")
  })

  it("marks the one in the address", () => {
    render(<FiltrosDeCobertura filtros={{ cobertura: "un-autor" }} conteos={CONTEOS} />)
    expect(screen.getByRole("link", { name: "Un solo autor · 1" })).toHaveAttribute("aria-current", "page")
    expect(screen.getByRole("link", { name: "Todos" })).not.toHaveAttribute("aria-current")
  })
})

describe("MasFiltrosDeTemas", () => {
  it("folds the active pillars and carries the coverage as a hidden field", () => {
    const { container } = render(<MasFiltrosDeTemas filtros={{ cobertura: "tratados" }} pilares={PILARES} />)
    expect(screen.getByText("Más filtros")).toBeInTheDocument()
    expect(container.querySelector("details")).not.toHaveAttribute("open")
    expect(
      within(screen.getByLabelText("Pilar"))
        .getAllByRole("option")
        .map((opcion) => opcion.textContent),
    ).toEqual(["Todos", "IA y salud mental", "Ética y regulación"])
    expect(container.querySelector('input[type="hidden"][name="cobertura"]')).toHaveAttribute("value", "tratados")
    expect(screen.queryByRole("link", { name: "Quitar este filtro" })).toBeNull()
  })

  it("with a pillar on comes open, says how many, and takes it out keeping the coverage", () => {
    const { container } = render(
      <MasFiltrosDeTemas filtros={{ cobertura: "tratados", pilar: PILAR }} pilares={PILARES} />,
    )
    expect(screen.getByText("Más filtros · 1")).toBeInTheDocument()
    expect(container.querySelector("details")).toHaveAttribute("open")
    expect(screen.getByLabelText("Pilar")).toHaveValue(PILAR)
    expect(screen.getByRole("link", { name: "Quitar este filtro" })).toHaveAttribute(
      "href",
      "/biblioteca/temas?cobertura=tratados",
    )
  })
})

describe("FormularioDeFiltros", () => {
  it("sends Temas' filters to Temas' own address, leaving an empty select out", () => {
    const { container } = render(
      <FormularioDeFiltros seccion="temas">
        <input type="hidden" name="cobertura" value="tratados" />
        <select name="pilar" defaultValue="">
          <option value="">Todos</option>
        </select>
      </FormularioDeFiltros>,
    )
    const formulario = container.querySelector("form")
    if (!formulario) throw new Error("Falta el formulario")
    expect(formulario).toHaveAttribute("action", "/biblioteca/temas")
    fireEvent.submit(formulario)
    expect(push).toHaveBeenCalledWith("/biblioteca/temas?cobertura=tratados", { scroll: false })
  })

  it("still sends Materiales' filters to Materiales by default", () => {
    const { container } = render(
      <FormularioDeFiltros>
        <input type="hidden" name="estado" value="listo" />
      </FormularioDeFiltros>,
    )
    const formulario = container.querySelector("form")
    if (!formulario) throw new Error("Falta el formulario")
    fireEvent.submit(formulario)
    expect(push).toHaveBeenCalledWith("/biblioteca?estado=listo", { scroll: false })
  })
})
