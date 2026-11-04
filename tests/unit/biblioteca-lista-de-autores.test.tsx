import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { ListaDeAutores } from "@/app/(app)/biblioteca/autores/lista-de-autores"
import type { AutorResumido } from "@/lib/dominio/biblioteca/autores"

const DANIELA = "11111111-2222-4333-8444-555555555555"
const ANA = "22222222-2222-4333-8444-555555555555"
const INSTITUTO = "33333333-2222-4333-8444-555555555555"
const AUTORES: AutorResumido[] = [
  {
    id: DANIELA,
    nombre: "Daniela Ruiz",
    credencial: "investigadora",
    tipo: "persona",
    alias: ["D. Ruiz"],
    materiales: 3,
    ideas: 12,
    temas: [
      { id: "t1", nombre: "Carga mental", ideas: 8 },
      { id: "t2", nombre: "Pausas", ideas: 4 },
    ],
  },
  { id: ANA, nombre: "Ana Pérez", credencial: null, tipo: "cuenta", alias: [], materiales: 1, ideas: 0, temas: [] },
  {
    id: INSTITUTO,
    nombre: "Instituto del Descanso",
    credencial: null,
    tipo: "institucion",
    alias: [],
    materiales: 0,
    ideas: 0,
    temas: [],
  },
]

function tarjeta(indice: number): HTMLElement {
  const encontrada = within(screen.getByRole("list", { name: "Autores" })).getAllByRole("listitem")[indice]
  if (!encontrada) throw new Error(`No hay tarjeta ${indice}`)
  return encontrada
}

describe("ListaDeAutores", () => {
  it("shows each author on the phone with kind, counts without zeros and top topics, and opens its page", () => {
    render(<ListaDeAutores autores={AUTORES} seleccion={null} />)
    expect(within(screen.getByRole("list", { name: "Autores" })).getAllByRole("listitem")).toHaveLength(3)
    expect(tarjeta(0)).toHaveTextContent("Persona · investigadora")
    expect(tarjeta(0)).toHaveTextContent("3 materiales · 12 ideas sacadas")
    expect(tarjeta(0)).toHaveTextContent("Carga mental · Pausas")
    expect(within(tarjeta(0)).getByRole("link")).toHaveAttribute("href", `/biblioteca/autores/${DANIELA}`)
    expect(tarjeta(1)).toHaveTextContent("Cuenta de redes")
    expect(tarjeta(1)).toHaveTextContent("1 material")
    expect(tarjeta(1)).not.toHaveTextContent("ideas sacadas")
  })

  it("says how to give an author material when it has none", () => {
    render(<ListaDeAutores autores={AUTORES} seleccion={null} />)
    expect(tarjeta(2)).toHaveTextContent("Todavía no hay material de esta persona. Súbelo desde Subir.")
    expect(within(tarjeta(2)).getByRole("link", { name: "Subir" })).toHaveAttribute("href", "/biblioteca/subir")
  })

  it("filters the cards and the table as she types, by name or alias, without accents or case (D5)", () => {
    render(<ListaDeAutores autores={AUTORES} seleccion={null} />)
    fireEvent.change(screen.getByLabelText("Buscar por nombre"), { target: { value: "D. RUÍZ" } })
    expect(within(screen.getByRole("list", { name: "Autores" })).getAllByRole("listitem")).toHaveLength(1)
    expect(within(screen.getByRole("table", { name: "Autores" })).getAllByRole("row")).toHaveLength(2)
    fireEvent.change(screen.getByLabelText("Buscar por nombre"), { target: { value: "zzz" } })
    expect(screen.getByText("Nadie se llama así todavía.")).toBeInTheDocument()
    expect(screen.queryByRole("list", { name: "Autores" })).toBeNull()
    expect(screen.queryByRole("table")).toBeNull()
    fireEvent.change(screen.getByLabelText("Buscar por nombre"), { target: { value: "" } })
    expect(within(screen.getByRole("list", { name: "Autores" })).getAllByRole("listitem")).toHaveLength(3)
  })

  it("on a computer is a table whose rows open the side panel with ?a, writing no zeros", () => {
    render(<ListaDeAutores autores={AUTORES} seleccion={DANIELA} />)
    const tabla = screen.getByRole("table", { name: "Autores" })
    expect(
      within(tabla)
        .getAllByRole("columnheader")
        .map((celda) => celda.textContent),
    ).toEqual(["Autor", "Tipo", "Temas", "Materiales", "Ideas sacadas"])
    const fila = within(tabla).getByRole("link", { name: "Daniela Ruiz" })
    expect(fila).toHaveAttribute("href", `/biblioteca/autores?a=${DANIELA}`)
    expect(fila).toHaveAttribute("data-abre-panel", DANIELA)
    expect(fila).toHaveAttribute("aria-current", "true")
    expect(within(tabla).getByRole("row", { name: /Instituto del Descanso/ })).not.toHaveTextContent("0")
  })
})
