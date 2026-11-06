import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

type Respuesta = { ok: true } | { ok: false; error: string }

const ID = "11111111-2222-4333-8444-555555555555"
const OTRO = "22222222-2222-4333-8444-555555555555"

const { acciones, push } = vi.hoisted(() => ({
  push: vi.fn(),
  acciones: {
    recuperarMaterialAccion: vi.fn(async (..._: unknown[]): Promise<Respuesta> => ({ ok: true })),
    recuperarAutorAccion: vi.fn(async (..._: unknown[]): Promise<Respuesta> => ({ ok: true })),
  },
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }) }))
vi.mock("@/app/(app)/biblioteca/acciones", () => acciones)

import { AvisoDeBorrado } from "@/app/(app)/biblioteca/aviso-de-borrado"

beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.useRealTimers())

const aviso = () => screen.findByRole("status")

describe("AvisoDeBorrado", () => {
  it("says what she deleted and offers Deshacer, focused", async () => {
    render(<AvisoDeBorrado tipo="material" borrado={{ id: ID, nombre: "Charla larga" }} />)
    expect(await aviso()).toHaveTextContent("Borré «Charla larga».")
    await waitFor(() => expect(screen.getByRole("button", { name: "Deshacer" })).toHaveFocus())
  })

  it("shows nothing without a note", () => {
    render(<AvisoDeBorrado tipo="material" borrado={null} />)
    expect(screen.queryByRole("status")).toBeNull()
  })

  it("recovers the material, waits while it does, then says Lo recuperé. without Deshacer", async () => {
    let soltar: (r: Respuesta) => void = () => {}
    acciones.recuperarMaterialAccion.mockImplementationOnce(
      () =>
        new Promise((resolver) => {
          soltar = resolver
        }),
    )
    render(<AvisoDeBorrado tipo="material" borrado={{ id: ID, nombre: "Charla larga" }} />)
    await aviso()
    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }))
    expect(acciones.recuperarMaterialAccion).toHaveBeenCalledWith(ID)
    expect(screen.getByRole("button", { name: "Deshaciendo…" })).toHaveAttribute("aria-disabled", "true")
    fireEvent.click(screen.getByRole("button", { name: "Deshaciendo…" }))
    expect(acciones.recuperarMaterialAccion).toHaveBeenCalledTimes(1)
    await act(async () => soltar({ ok: true }))
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Lo recuperé."))
    expect(screen.queryByRole("button", { name: "Deshacer" })).toBeNull()
  })

  it("recovers an author with the author's action", async () => {
    render(<AvisoDeBorrado tipo="autor" borrado={{ id: ID, nombre: "Instituto" }} />)
    await aviso()
    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }))
    await waitFor(() => expect(acciones.recuperarAutorAccion).toHaveBeenCalledWith(ID))
  })

  it("says it can no longer be recovered when maintenance was first", async () => {
    acciones.recuperarMaterialAccion.mockResolvedValueOnce({
      ok: false,
      error: "Ya no se puede recuperar: se borró del todo.",
    })
    render(<AvisoDeBorrado tipo="material" borrado={{ id: ID, nombre: null }} />)
    expect(await aviso()).toHaveTextContent("Lo borré.")
    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }))
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Ya no se puede recuperar: se borró del todo."),
    )
  })

  it("keeps its toast when the note leaves the address, and starts again for a new deletion", async () => {
    const { rerender } = render(<AvisoDeBorrado tipo="material" borrado={{ id: ID, nombre: "Uno" }} />)
    await aviso()
    rerender(<AvisoDeBorrado tipo="material" borrado={null} />)
    expect(screen.getByRole("status")).toHaveTextContent("Borré «Uno».")
    rerender(<AvisoDeBorrado tipo="material" borrado={{ id: OTRO, nombre: "Dos" }} />)
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Borré «Dos»."))
  })

  it("shows the toast again when the same id is deleted a second time after the note left the address", async () => {
    const { rerender } = render(<AvisoDeBorrado tipo="material" borrado={{ id: ID, nombre: "Uno" }} />)
    await aviso()
    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }))
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Lo recuperé."))
    rerender(<AvisoDeBorrado tipo="material" borrado={{ id: ID, nombre: "Uno" }} />)
    rerender(<AvisoDeBorrado tipo="material" borrado={null} />)
    rerender(<AvisoDeBorrado tipo="material" borrado={{ id: ID, nombre: "Uno" }} />)
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Borré «Uno»."))
    expect(screen.getByRole("button", { name: "Deshacer" })).toBeInTheDocument()
  })

  it("closes after 8 seconds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<AvisoDeBorrado tipo="material" borrado={{ id: ID, nombre: "Uno" }} />)
    await aviso()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8_000)
    })
    expect(screen.queryByRole("status")).toBeNull()
  })

  it("sends her to sign in when the session ended", async () => {
    acciones.recuperarMaterialAccion.mockResolvedValueOnce({ ok: false, error: "Tu sesión venció. Entra de nuevo." })
    render(<AvisoDeBorrado tipo="material" borrado={{ id: ID, nombre: "Uno" }} />)
    await aviso()
    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }))
    await waitFor(() => expect(push).toHaveBeenCalledWith("/ingreso"))
  })
})
