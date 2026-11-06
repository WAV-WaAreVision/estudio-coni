import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

type Respuesta = { ok: true; destino: string } | { ok: false; error: string }

const ID = "11111111-2222-4333-8444-555555555555"

const { acciones, replace } = vi.hoisted(() => ({
  replace: vi.fn(),
  acciones: {
    borrarMaterialAccion: vi.fn(
      async (..._: unknown[]): Promise<Respuesta> => ({ ok: true, destino: "/biblioteca?aviso=borrado&id=x" }),
    ),
    borrarAutorAccion: vi.fn(
      async (..._: unknown[]): Promise<Respuesta> => ({ ok: true, destino: "/biblioteca/autores?aviso=borrado&id=x" }),
    ),
  },
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace }) }))
vi.mock("@/app/(app)/biblioteca/acciones", () => acciones)

import { BotonBorrar } from "@/app/(app)/biblioteca/boton-borrar"

beforeEach(() => vi.clearAllMocks())

describe("BotonBorrar", () => {
  it("deletes a material at once, with no question, and goes to the list the action names", async () => {
    render(<BotonBorrar tipo="material" id={ID} />)
    fireEvent.click(screen.getByRole("button", { name: "Borrar material" }))
    await waitFor(() => expect(acciones.borrarMaterialAccion).toHaveBeenCalledWith(ID))
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/biblioteca?aviso=borrado&id=x"))
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("deletes an author with its own words and action", async () => {
    render(<BotonBorrar tipo="autor" id={ID} />)
    fireEvent.click(screen.getByRole("button", { name: "Borrar autor" }))
    await waitFor(() => expect(acciones.borrarAutorAccion).toHaveBeenCalledWith(ID))
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/biblioteca/autores?aviso=borrado&id=x"))
  })

  it("stays, says why in an error line and can be tapped again when it failed", async () => {
    acciones.borrarMaterialAccion.mockResolvedValueOnce({ ok: false, error: "No pude borrarlo. Prueba de nuevo." })
    render(<BotonBorrar tipo="material" id={ID} />)
    fireEvent.click(screen.getByRole("button", { name: "Borrar material" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("No pude borrarlo. Prueba de nuevo.")
    expect(replace).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Borrar material" }))
    await waitFor(() => expect(acciones.borrarMaterialAccion).toHaveBeenCalledTimes(2))
  })

  it("ignores a second tap while the first is on its way", async () => {
    render(<BotonBorrar tipo="material" id={ID} />)
    const boton = screen.getByRole("button", { name: "Borrar material" })
    fireEvent.click(boton)
    fireEvent.click(boton)
    await waitFor(() => expect(replace).toHaveBeenCalled())
    expect(acciones.borrarMaterialAccion).toHaveBeenCalledTimes(1)
  })
})
