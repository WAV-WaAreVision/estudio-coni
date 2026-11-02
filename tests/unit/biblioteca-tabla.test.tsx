import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { TablaDeMateriales } from "@/app/(app)/biblioteca/tabla-de-materiales"
import type { MaterialDeLista } from "@/lib/datos/biblioteca"

const AHORA = Date.parse("2026-11-02T15:00:00Z")
const fila = (id: string, titulo: string, creado_en: string): MaterialDeLista => ({
  id,
  titulo,
  autor_id: "a",
  autor: "Daniela Ruiz",
  rol: "referente",
  tipo: "documento",
  estado: "listo",
  motivo_fallo: null,
  costo_estimado_usd: null,
  costo_confirmado_en: null,
  creado_en,
  tema: { nombre: "Carga mental", otros: 0 },
})
const UNO = "11111111-2222-4333-8444-555555555555"
const DOS = "99999999-2222-4333-8444-555555555555"
const materiales = [fila(UNO, "Burnout", "2026-10-31T12:00:00Z"), fila(DOS, "Pausas", "2026-11-02T12:00:00Z")]

describe("TablaDeMateriales", () => {
  it("has the six columns of the mockup and a caption", () => {
    render(<TablaDeMateriales materiales={materiales} filtros={{}} seleccion={null} ahora={AHORA} />)
    const tabla = screen.getByRole("table", { name: "Materiales" })
    expect(
      within(tabla)
        .getAllByRole("columnheader")
        .map((celda) => celda.textContent),
    ).toEqual(["Material", "Tipo", "Autor", "Tema", "Estado", "Subido"])
    expect(within(tabla).getAllByRole("row")).toHaveLength(3)
  })

  it("makes each row a link that opens the side panel with ?m, keeping the filters", () => {
    render(<TablaDeMateriales materiales={materiales} filtros={{ estado: "listo" }} seleccion={null} ahora={AHORA} />)
    expect(screen.getByRole("link", { name: "Burnout" })).toHaveAttribute("href", `/biblioteca?estado=listo&m=${UNO}`)
    // The focus of the panel finds the row that opened it by this mark.
    expect(screen.getByRole("link", { name: "Burnout" })).toHaveAttribute("data-abre-panel", UNO)
    expect(screen.getByRole("row", { name: /Pausas/ })).toHaveTextContent("Hoy")
  })

  it("marks the selected row as current", () => {
    render(<TablaDeMateriales materiales={materiales} filtros={{}} seleccion={UNO} ahora={AHORA} />)
    expect(screen.getByRole("link", { name: "Burnout" })).toHaveAttribute("aria-current", "true")
    expect(screen.getByRole("link", { name: "Pausas" })).not.toHaveAttribute("aria-current")
  })
})
