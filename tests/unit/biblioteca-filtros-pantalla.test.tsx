import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }) }))

import { FiltrosRapidos } from "@/app/(app)/biblioteca/filtros-rapidos"
import { MasFiltros } from "@/app/(app)/biblioteca/mas-filtros"

const AUTOR = "6f1d6c2e-8f43-4a8e-9a3f-2b1c7a0d9e55"

beforeEach(() => vi.clearAllMocks())

describe("FiltrosRapidos", () => {
  it("is one row of one-tap filters, the current one pressed, with counts only above zero (4i)", () => {
    render(<FiltrosRapidos filtros={{ estado: "fallido" }} conteos={{ procesando: 0, fallido: 1 }} />)
    expect(screen.getByRole("group", { name: "Filtrar por estado" })).toBeInTheDocument()
    expect(screen.getAllByRole("button").map((boton) => boton.textContent)).toEqual([
      "Todos",
      "Procesando",
      "Listos",
      "Con error · 1",
    ])
    expect(screen.getByRole("button", { name: "Con error · 1" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "Todos" })).toHaveAttribute("aria-pressed", "false")
  })

  it("keeps the folded filters and drops the open panel when it changes the state", () => {
    render(<FiltrosRapidos filtros={{ autor: AUTOR }} conteos={{ procesando: 2, fallido: 0 }} />)
    fireEvent.click(screen.getByRole("button", { name: "Procesando · 2" }))
    expect(replace).toHaveBeenCalledWith(`/biblioteca?autor=${AUTOR}&estado=procesando`, { scroll: false })
    fireEvent.click(screen.getByRole("button", { name: "Todos" }))
    expect(replace).toHaveBeenLastCalledWith(`/biblioteca?autor=${AUTOR}`, { scroll: false })
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
