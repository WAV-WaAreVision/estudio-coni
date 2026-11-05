import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

type Respuesta = { ok: true } | { ok: false; error: string }

const { guardarBorradorDeRedAccion, editarBorradorDeRedAccion } = vi.hoisted(() => ({
  guardarBorradorDeRedAccion: vi.fn(async (..._: unknown[]): Promise<Respuesta> => ({ ok: true })),
  editarBorradorDeRedAccion: vi.fn(async (..._: unknown[]): Promise<Respuesta> => ({ ok: true })),
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock("@/app/(app)/biblioteca/temas/borradores/acciones", () => ({
  guardarBorradorDeRedAccion,
  editarBorradorDeRedAccion,
}))

import { FormularioDeRed } from "@/app/(app)/biblioteca/temas/formulario-de-red"
import { FALTA_NOMBRE_DE_RED } from "@/lib/dominio/biblioteca/borradores"

const ID = "11111111-2222-4333-8444-555555555555"

beforeEach(() => vi.clearAllMocks())

describe("FormularioDeRed", () => {
  it("saves a network with only its name; the three notes are optional and multi-line", async () => {
    render(<FormularioDeRed modo={{ tipo: "nuevo" }} cancelar="/biblioteca/temas" />)
    for (const etiqueta of ["Manual (opcional)", "Receta (opcional)", "Conexión (opcional)"]) {
      expect(screen.getByLabelText(etiqueta).tagName).toBe("TEXTAREA")
    }
    expect(screen.getByLabelText("Conexión (opcional)")).toHaveAccessibleDescription(
      "Qué cuenta usar para publicar. No escribas contraseñas aquí.",
    )
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: " TikTok " } })
    fireEvent.click(screen.getByRole("button", { name: "Guardar borrador" }))
    await waitFor(() =>
      expect(guardarBorradorDeRedAccion).toHaveBeenCalledWith({
        nombre: "TikTok",
        manual: "",
        receta: "",
        conexion: "",
      }),
    )
  })

  it("says a missing name and focuses it", () => {
    render(<FormularioDeRed modo={{ tipo: "nuevo" }} cancelar="/biblioteca/temas" />)
    fireEvent.click(screen.getByRole("button", { name: "Guardar borrador" }))
    expect(screen.getByRole("alert")).toHaveTextContent(FALTA_NOMBRE_DE_RED)
    expect(screen.getByLabelText("Nombre")).toHaveFocus()
    expect(guardarBorradorDeRedAccion).not.toHaveBeenCalled()
  })

  it("edits a saved network draft from its values", async () => {
    render(
      <FormularioDeRed
        modo={{ tipo: "editar", id: ID }}
        inicial={{ nombre: "TikTok", manual: "Videos cortos.", receta: "", conexion: "" }}
        cancelar="/biblioteca/temas/borradores"
      />,
    )
    expect(screen.getByLabelText("Manual (opcional)")).toHaveValue("Videos cortos.")
    fireEvent.change(screen.getByLabelText("Receta (opcional)"), { target: { value: "Un gancho y tres pasos." } })
    fireEvent.click(screen.getByRole("button", { name: "Guardar borrador" }))
    await waitFor(() =>
      expect(editarBorradorDeRedAccion).toHaveBeenCalledWith({
        id: ID,
        nombre: "TikTok",
        manual: "Videos cortos.",
        receta: "Un gancho y tres pasos.",
        conexion: "",
      }),
    )
    expect(screen.getByRole("link", { name: "Cancelar" })).toHaveAttribute("href", "/biblioteca/temas/borradores")
  })
})
