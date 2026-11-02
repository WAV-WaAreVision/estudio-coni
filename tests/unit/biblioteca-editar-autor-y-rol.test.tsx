import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

type R = { ok: true } | { ok: false; error: string }
const { editarMaterialAccion, crearAutorAccion } = vi.hoisted(() => ({
  editarMaterialAccion: vi.fn(async (..._: unknown[]): Promise<R> => ({ ok: true })),
  crearAutorAccion: vi.fn(),
}))
vi.mock("@/app/(app)/biblioteca/acciones", () => ({ editarMaterialAccion, crearAutorAccion }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }))

import { AVISO_REPROCESAR, EditarAutorYRol } from "@/app/(app)/biblioteca/materiales/[id]/editar-autor-y-rol"

const ID = "11111111-2222-4333-8444-555555555555"
const AUTORES = [{ id: "a-1", nombre: "Daniela Ruiz", credencial: null, tipo: "persona", alias: [] }]

beforeEach(() => vi.clearAllMocks())

describe("EditarAutorYRol", () => {
  it("asks who it is for her in her words and saves the role she picks", async () => {
    render(<EditarAutorYRol materialId={ID} autores={AUTORES} autorId="a-1" rol="referente" conIdeas />)
    fireEvent.click(screen.getByRole("button", { name: "Cambiar autor o quién es para ti" }))
    expect(screen.getByRole("group", { name: "¿Quién es para ti?" })).toBeInTheDocument()
    expect(screen.queryByText("Papel")).toBeNull()
    fireEvent.click(screen.getByRole("radio", { name: "Estudio o libro" }))
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }))
    await waitFor(() =>
      expect(editarMaterialAccion).toHaveBeenCalledWith({ materialId: ID, autorId: "a-1", rol: "evidencia" }),
    )
    expect(await screen.findByText(AVISO_REPROCESAR)).toBeInTheDocument()
  })

  it("Cancelar puts everything back without saving", () => {
    render(<EditarAutorYRol materialId={ID} autores={AUTORES} autorId="a-1" rol="referente" conIdeas={false} />)
    fireEvent.click(screen.getByRole("button", { name: "Cambiar autor o quién es para ti" }))
    fireEvent.click(screen.getByRole("radio", { name: "Estudio o libro" }))
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }))
    expect(editarMaterialAccion).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Cambiar autor o quién es para ti" }))
    expect(screen.getByRole("radio", { name: "Referente" })).toBeChecked()
  })

  it("says a refusal", async () => {
    editarMaterialAccion.mockResolvedValueOnce({ ok: false, error: "Ese autor ya no existe. Elígelo de nuevo." })
    render(<EditarAutorYRol materialId={ID} autores={AUTORES} autorId="a-1" rol="referente" conIdeas={false} />)
    fireEvent.click(screen.getByRole("button", { name: "Cambiar autor o quién es para ti" }))
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Ese autor ya no existe. Elígelo de nuevo.")
  })
})
