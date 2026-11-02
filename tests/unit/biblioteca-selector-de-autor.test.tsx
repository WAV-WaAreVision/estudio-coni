import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { SelectorDeAutor } from "@/app/(app)/biblioteca/selector-de-autor"
import type { AutorDeLista } from "@/lib/dominio/biblioteca/autores"

const autor = (id: string, nombre: string, credencial: string | null = null): AutorDeLista => ({
  id,
  nombre,
  credencial,
  tipo: "persona",
  alias: [],
})
const AUTORES = [autor("1", "Esther Perel", "Psicoterapeuta"), autor("2", "Instituto Gottman")]

describe("SelectorDeAutor", () => {
  it("shows the picked author and lets her change it", () => {
    const alElegir = vi.fn()
    render(<SelectorDeAutor autores={AUTORES} valor="1" alElegir={alElegir} alCrear={vi.fn()} />)
    expect(screen.getByText("Esther Perel")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Cambiar autor" }))
    fireEvent.change(screen.getByLabelText("Autor"), { target: { value: "gott" } })
    fireEvent.click(screen.getByRole("button", { name: "Instituto Gottman" }))
    expect(alElegir).toHaveBeenCalledWith("2")
  })

  it("adds a new author inline, warning about a look-alike first", async () => {
    const alElegir = vi.fn()
    const alCrear = vi.fn(async () => ({ ok: true as const, autor: autor("3", "Esther Perel Jr") }))
    render(<SelectorDeAutor autores={AUTORES} valor="" alElegir={alElegir} alCrear={alCrear} />)
    fireEvent.change(screen.getByLabelText("Autor"), { target: { value: "Esther Perel Jr" } })
    fireEvent.click(screen.getByRole("button", { name: "Autor nuevo" }))
    expect(screen.getByText("¿Es el mismo autor que Esther Perel?")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Crear autor" }))
    await waitFor(() =>
      expect(alCrear).toHaveBeenCalledWith({ nombre: "Esther Perel Jr", credencial: "", tipo: "persona" }),
    )
    expect(alElegir).toHaveBeenCalledWith("3")
  })

  it("says why the author could not be created", async () => {
    const alCrear = vi.fn(async () => ({ ok: false as const, error: "Escribe el nombre del autor." }))
    render(<SelectorDeAutor autores={AUTORES} valor="" alElegir={vi.fn()} alCrear={alCrear} />)
    fireEvent.click(screen.getByRole("button", { name: "Autor nuevo" }))
    fireEvent.click(screen.getByRole("button", { name: "Crear autor" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Escribe el nombre del autor.")
  })
})
