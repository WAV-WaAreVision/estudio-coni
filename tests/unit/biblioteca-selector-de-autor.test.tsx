import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }) }))

import { SelectorDeAutor } from "@/app/(app)/biblioteca/selector-de-autor"
import { ERROR_SESION_VENCIDA } from "@/lib/acciones/resultado"
import { type AutorDeLista, LARGO_DE_AUTOR_NUEVO } from "@/lib/dominio/biblioteca/autores"

const autor = (id: string, nombre: string, credencial: string | null = null): AutorDeLista => ({
  id,
  nombre,
  credencial,
  tipo: "persona",
  alias: [],
})
const AUTORES = [autor("1", "Esther Perel", "Psicoterapeuta"), autor("2", "Instituto Gottman")]

beforeEach(() => vi.clearAllMocks())

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

  it("caps the new author's name and credential at what the action takes", () => {
    render(<SelectorDeAutor autores={AUTORES} valor="" alElegir={vi.fn()} alCrear={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "Autor nuevo" }))
    expect(screen.getByLabelText("Nombre del autor")).toHaveAttribute("maxLength", String(LARGO_DE_AUTOR_NUEVO))
    expect(screen.getByLabelText(/Credencial/)).toHaveAttribute("maxLength", String(LARGO_DE_AUTOR_NUEVO))
  })

  it("does not stay saving when the action is rejected, and says it", async () => {
    const alCrear = vi.fn(async () => {
      throw new Error("red caída")
    })
    render(<SelectorDeAutor autores={AUTORES} valor="" alElegir={vi.fn()} alCrear={alCrear} />)
    fireEvent.click(screen.getByRole("button", { name: "Autor nuevo" }))
    fireEvent.change(screen.getByLabelText("Nombre del autor"), { target: { value: "Nueva" } })
    fireEvent.click(screen.getByRole("button", { name: "Crear autor" }))
    expect(await screen.findByRole("alert")).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole("button", { name: "Crear autor" })).not.toHaveAttribute("aria-busy"))
  })

  it("sends her to sign in again when the session ended", async () => {
    const alCrear = vi.fn(async () => ({ ok: false as const, error: ERROR_SESION_VENCIDA }))
    render(<SelectorDeAutor autores={AUTORES} valor="" alElegir={vi.fn()} alCrear={alCrear} />)
    fireEvent.click(screen.getByRole("button", { name: "Autor nuevo" }))
    fireEvent.change(screen.getByLabelText("Nombre del autor"), { target: { value: "Nueva" } })
    fireEvent.click(screen.getByRole("button", { name: "Crear autor" }))
    await waitFor(() => expect(push).toHaveBeenCalledWith("/ingreso"))
  })

  it("says so when the new name was an author she already had, and picks that one", async () => {
    const conAlias = { ...autor("2", "Instituto Gottman"), alias: ["Gottman Institute"] }
    const alElegir = vi.fn()
    const alCrear = vi.fn(async () => ({ ok: true as const, autor: conAlias }))
    const { rerender } = render(
      <SelectorDeAutor autores={[AUTORES[0], conAlias]} valor="" alElegir={alElegir} alCrear={alCrear} />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Autor nuevo" }))
    fireEvent.change(screen.getByLabelText("Nombre del autor"), { target: { value: "The Gottman Institute" } })
    fireEvent.click(screen.getByRole("button", { name: "Crear autor" }))
    await waitFor(() => expect(alElegir).toHaveBeenCalledWith("2"))
    rerender(<SelectorDeAutor autores={[AUTORES[0], conAlias]} valor="2" alElegir={alElegir} alCrear={alCrear} />)
    expect(screen.getByText("Ya existía como Instituto Gottman; lo elegí.")).toBeInTheDocument()
  })

  it("announces how many authors the search finds, or that nobody is called that", () => {
    render(<SelectorDeAutor autores={AUTORES} valor="" alElegir={vi.fn()} alCrear={vi.fn()} />)
    const estado = screen.getByRole("status")
    expect(estado).toHaveAttribute("aria-live", "polite")
    expect(estado).toHaveTextContent("2 autores")
    fireEvent.change(screen.getByLabelText("Autor"), { target: { value: "gott" } })
    expect(estado).toHaveTextContent("1 autor")
    fireEvent.change(screen.getByLabelText("Autor"), { target: { value: "zzz" } })
    expect(estado).toHaveTextContent("Nadie se llama así todavía.")
  })

  it("focuses the search when Cambiar opens it, and Cambiar again after choosing", () => {
    const { rerender } = render(<SelectorDeAutor autores={AUTORES} valor="1" alElegir={vi.fn()} alCrear={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "Cambiar autor" }))
    expect(screen.getByLabelText("Autor")).toHaveFocus()
    fireEvent.click(screen.getByRole("button", { name: "Instituto Gottman" }))
    rerender(<SelectorDeAutor autores={AUTORES} valor="2" alElegir={vi.fn()} alCrear={vi.fn()} />)
    expect(screen.getByRole("button", { name: "Cambiar autor" })).toHaveFocus()
  })

  it("lets her keep the current author from the search", () => {
    const alElegir = vi.fn()
    render(<SelectorDeAutor autores={AUTORES} valor="1" alElegir={alElegir} alCrear={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "Cambiar autor" }))
    fireEvent.click(screen.getByRole("button", { name: "Dejar a Esther Perel" }))
    expect(screen.getByText("Esther Perel")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Cambiar autor" })).toHaveFocus()
    expect(alElegir).not.toHaveBeenCalled()
  })

  // The material's detail mounts the phone's copy and the computer's at once: each needs ids of its own.
  it("two selectors on one page, searching and creating, share no id", () => {
    const { container } = render(
      <>
        <SelectorDeAutor autores={AUTORES} valor="" alElegir={vi.fn()} alCrear={vi.fn()} />
        <SelectorDeAutor autores={AUTORES} valor="" alElegir={vi.fn()} alCrear={vi.fn()} />
      </>,
    )
    const sinRepetir = () => {
      const ids = [...container.querySelectorAll("[id]")].map((el) => el.id)
      expect(ids.length).toBeGreaterThan(0)
      expect(new Set(ids).size).toBe(ids.length)
    }
    sinRepetir()
    expect(screen.getAllByLabelText("Autor")).toHaveLength(2)
    for (const boton of screen.getAllByRole("button", { name: "Autor nuevo" })) fireEvent.click(boton)
    sinRepetir()
    expect(screen.getAllByLabelText("Nombre del autor")).toHaveLength(2)
    expect(screen.getAllByLabelText("Tipo de autor")).toHaveLength(2)
  })
})
