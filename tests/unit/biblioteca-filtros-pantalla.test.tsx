import { render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }) }))

import { FiltrosRapidos } from "@/app/(app)/biblioteca/filtros-rapidos"
import { MasFiltros } from "@/app/(app)/biblioteca/mas-filtros"

const AUTOR = "6f1d6c2e-8f43-4a8e-9a3f-2b1c7a0d9e55"

beforeEach(() => vi.clearAllMocks())

describe("FiltrosRapidos", () => {
  it("is one row of one-tap filter links, the current one marked, with counts only above zero (4i)", () => {
    render(<FiltrosRapidos filtros={{ estado: "fallido" }} conteos={{ procesando: 0, fallido: 1 }} />)
    const grupo = screen.getByRole("group", { name: "Filtrar por estado" })
    expect(
      within(grupo)
        .getAllByRole("link")
        .map((enlace) => enlace.textContent),
    ).toEqual(["Todos", "Procesando", "Listos", "Con error · 1"])
    expect(screen.getByRole("link", { name: "Con error · 1" })).toHaveAttribute("aria-current", "page")
    expect(screen.getByRole("link", { name: "Todos" })).not.toHaveAttribute("aria-current")
  })

  it("links each state keeping the folded filters and dropping the open panel, so Back undoes it", () => {
    render(<FiltrosRapidos filtros={{ autor: AUTOR }} conteos={{ procesando: 2, fallido: 0 }} />)
    expect(screen.getByRole("link", { name: "Procesando · 2" })).toHaveAttribute(
      "href",
      `/biblioteca?autor=${AUTOR}&estado=procesando`,
    )
    expect(screen.getByRole("link", { name: "Todos" })).toHaveAttribute("href", `/biblioteca?autor=${AUTOR}`)
  })

  it("draws the links as chips: raised, the current one filled with ink and a check", () => {
    render(<FiltrosRapidos filtros={{}} conteos={{ procesando: 0, fallido: 0 }} />)
    const todos = screen.getByRole("link", { name: "Todos" })
    expect(todos).toHaveClass("rounded-control", "shadow-relieve", "min-h-objetivo", "aria-[current=page]:bg-tinta")
    expect(todos.querySelector("svg")).not.toBeNull()
    expect(screen.getByRole("link", { name: "Listos" }).querySelector("svg")).toBeNull()
  })
})

describe("MasFiltros", () => {
  const autores = [{ id: AUTOR, nombre: "Daniela Ruiz" }]

  it("folds author, who she is for you and type into a GET form that keeps the quick filter", () => {
    const { container } = render(<MasFiltros filtros={{ estado: "listo" }} autores={autores} />)
    expect(container.querySelector("details")).not.toHaveAttribute("open")
    expect(screen.getByText("Más filtros")).toBeInTheDocument()
    const formulario = container.querySelector("form")
    expect(formulario).toHaveAttribute("method", "get")
    expect(formulario).toHaveAttribute("action", "/biblioteca")
    expect(container.querySelector("input[type=hidden][name=estado]")).toHaveAttribute("value", "listo")
    expect(screen.getByLabelText("Autor")).toHaveDisplayValue("Todos")
    expect(screen.getByLabelText("¿Quién es para ti?")).toBeInTheDocument()
    expect(screen.getByLabelText("Tipo")).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Quitar estos filtros" })).toBeNull()
  })

  it("opens by itself and offers to clear when a folded filter is on", () => {
    const { container } = render(<MasFiltros filtros={{ estado: "listo", rol: "evidencia" }} autores={autores} />)
    expect(container.querySelector("details")).toHaveAttribute("open")
    expect(screen.getByText("1 activo")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Quitar estos filtros" })).toHaveAttribute(
      "href",
      "/biblioteca?estado=listo",
    )
  })
})
