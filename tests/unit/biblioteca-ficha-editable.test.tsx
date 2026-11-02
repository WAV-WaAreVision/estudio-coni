import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

type R = { ok: true } | { ok: false; error: string }
const { editarFichaAccion } = vi.hoisted(() => ({
  editarFichaAccion: vi.fn(async (..._: unknown[]): Promise<R> => ({ ok: true })),
}))
vi.mock("@/app/(app)/biblioteca/acciones", () => ({ editarFichaAccion }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }))

import { FichaEditable } from "@/app/(app)/biblioteca/materiales/[id]/ficha-editable"
import type { FichaLeida } from "@/lib/dominio/biblioteca/ficha"

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
})
