import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

type R = { ok: true } | { ok: false; error: string }
const { editarFichaAccion } = vi.hoisted(() => ({
  editarFichaAccion: vi.fn(async (..._: unknown[]): Promise<R> => ({ ok: true })),
}))
vi.mock("@/app/(app)/biblioteca/acciones", () => ({ editarFichaAccion }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }))

import { FichaEditable } from "@/app/(app)/biblioteca/materiales/[id]/ficha-editable"
import {
  ANIO_MAXIMO,
  ANIO_MINIMO,
  type FichaLeida,
  LARGO_DE_AUTOR,
  LARGO_DE_CITA,
  LARGO_DE_ENLACE,
  LARGO_DE_IDEA,
  LARGO_DE_RESUMEN,
} from "@/lib/dominio/biblioteca/ficha"

const ID = "11111111-2222-4333-8444-555555555555"
const FICHA: FichaLeida = {
  resumen: "Un plan para noviembre.",
  ideasClave: ["Una", "Dos", "Tres", "Cuatro", "Cinco"],
  citas: [{ texto: "Una cita", ubicacion: { pagina: 4 } }],
  fuente: { autor: "Equipo", anio: 2026, enlace: null },
}

beforeEach(() => vi.clearAllMocks())

describe("FichaEditable", () => {
  it("reads the card: summary, key ideas, quotes with their place and the source", () => {
    render(<FichaEditable materialId={ID} ficha={FICHA} />)
    expect(screen.getByRole("heading", { name: "Resumen" })).toBeInTheDocument()
    expect(screen.getByText("Un plan para noviembre.")).toBeInTheDocument()
    expect(screen.getAllByRole("listitem")).toHaveLength(5)
    expect(screen.getByText("página 4")).toBeInTheDocument()
    expect(screen.getByText("Equipo · 2026")).toBeInTheDocument()
  })

  it("links the source only when it is a web address, and shows anything else as plain text", () => {
    const web = render(
      <FichaEditable
        materialId={ID}
        ficha={{ ...FICHA, fuente: { ...FICHA.fuente, enlace: "https://ejemplo.cl/x" } }}
      />,
    )
    expect(screen.getByRole("link", { name: "https://ejemplo.cl/x" })).toHaveAttribute("href", "https://ejemplo.cl/x")
    web.unmount()
    // The card keeps what it read in its own state: each value is a fresh render.
    for (const enlace of ["javascript:alert(1)", "data:text/html,hola", "/biblioteca/otra"]) {
      const { unmount } = render(
        <FichaEditable materialId={ID} ficha={{ ...FICHA, fuente: { ...FICHA.fuente, enlace } }} />,
      )
      expect(screen.getByText(enlace).closest("a")).toBeNull()
      expect(screen.queryByRole("link")).toBeNull()
      unmount()
    }
  })

  it("edits and saves only a valid card, saying what is wrong first", async () => {
    render(<FichaEditable materialId={ID} ficha={FICHA} />)
    fireEvent.click(screen.getByRole("button", { name: "Editar" }))
    fireEvent.click(screen.getByRole("button", { name: "Quitar la idea clave 5" }))
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Deja entre 5 y 10 ideas clave.")
    expect(editarFichaAccion).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "Agregar una idea clave" }))
    fireEvent.change(screen.getByLabelText("Idea clave 5"), { target: { value: "Cinco bis" } })
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }))
    await waitFor(() =>
      expect(editarFichaAccion).toHaveBeenCalledWith(
        expect.objectContaining({ materialId: ID, ideasClave: ["Una", "Dos", "Tres", "Cuatro", "Cinco bis"] }),
      ),
    )
    expect(await screen.findByText("Cinco bis")).toBeInTheDocument()
  })

  it("caps every field at the length the action takes and never lets the browser speak for itself", () => {
    const { container } = render(<FichaEditable materialId={ID} ficha={FICHA} />)
    fireEvent.click(screen.getByRole("button", { name: "Editar" }))
    expect(container.querySelector("form")).toHaveAttribute("novalidate")
    expect(screen.getByLabelText("Resumen")).toHaveAttribute("maxLength", String(LARGO_DE_RESUMEN))
    expect(screen.getByLabelText("Idea clave 1")).toHaveAttribute("maxLength", String(LARGO_DE_IDEA))
    expect(screen.getByLabelText("Texto de la cita 1")).toHaveAttribute("maxLength", String(LARGO_DE_CITA))
    expect(screen.getByLabelText("Autor de la fuente")).toHaveAttribute("maxLength", String(LARGO_DE_AUTOR))
    expect(screen.getByLabelText("Enlace")).toHaveAttribute("maxLength", String(LARGO_DE_ENLACE))
    const anio = screen.getByLabelText("Año")
    expect(anio).toHaveAttribute("min", String(ANIO_MINIMO))
    expect(anio).toHaveAttribute("max", String(ANIO_MAXIMO))
  })

  it("says a year that is not a whole number instead of saving the card without it", async () => {
    render(<FichaEditable materialId={ID} ficha={FICHA} />)
    fireEvent.click(screen.getByRole("button", { name: "Editar" }))
    fireEvent.change(screen.getByLabelText("Año"), { target: { value: "2024.5" } })
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }))
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Escribe el año como un número entero, por ejemplo 2024.",
    )
    expect(editarFichaAccion).not.toHaveBeenCalled()
  })

  it("focuses the summary when it opens, and Editar again after saving", async () => {
    render(<FichaEditable materialId={ID} ficha={FICHA} />)
    fireEvent.click(screen.getByRole("button", { name: "Editar" }))
    expect(screen.getByLabelText("Resumen")).toHaveFocus()
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "Editar" })).toHaveFocus())
  })

  it("Cancelar without changes closes and gives the focus back to Editar", () => {
    render(<FichaEditable materialId={ID} ficha={FICHA} />)
    fireEvent.click(screen.getByRole("button", { name: "Editar" }))
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }))
    expect(screen.queryByText("¿Descartar lo que cambiaste?")).toBeNull()
    expect(screen.getByRole("button", { name: "Editar" })).toHaveFocus()
  })

  it("Cancelar with changes asks first, and only discards them on yes", () => {
    render(<FichaEditable materialId={ID} ficha={FICHA} />)
    fireEvent.click(screen.getByRole("button", { name: "Editar" }))
    fireEvent.change(screen.getByLabelText("Resumen"), { target: { value: "Otro resumen" } })
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }))
    expect(screen.getByText("¿Descartar lo que cambiaste?")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Seguir editando" }))
    expect(screen.getByLabelText("Resumen")).toHaveValue("Otro resumen")
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }))
    fireEvent.click(screen.getByRole("button", { name: "Sí, descartar" }))
    expect(screen.getByText("Un plan para noviembre.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Editar" })).toHaveFocus()
    expect(editarFichaAccion).not.toHaveBeenCalled()
  })

  it("keeps the Quitar buttons small, each named after what it removes", () => {
    render(<FichaEditable materialId={ID} ficha={FICHA} />)
    fireEvent.click(screen.getByRole("button", { name: "Editar" }))
    for (const nombre of ["Quitar la idea clave 1", "Quitar la cita 1"]) {
      const boton = screen.getByRole("button", { name: nombre })
      expect(boton).toHaveTextContent("Quitar")
      expect(boton.className).toContain("w-fit")
    }
  })
})
