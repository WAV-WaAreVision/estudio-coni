import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { descartarAccion, reintentarAccion } = vi.hoisted(() => ({
  descartarAccion: vi.fn(async (..._: unknown[]) => ({ ok: true as const })),
  reintentarAccion: vi.fn(async (..._: unknown[]) => ({ ok: true as const })),
}))
vi.mock("@/app/(app)/piezas/acciones", () => ({
  descartarAccion,
  reintentarAccion,
  reintentarGuionAccion: vi.fn(),
  cambiarFechaAccion: vi.fn(),
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

import { AccionesDeEstado } from "@/app/(app)/estado-de-pieza"

beforeEach(() => vi.clearAllMocks())

describe("AccionesDeEstado", () => {
  it("asks before discarding a piece and draws discard as destructive text", async () => {
    render(<AccionesDeEstado piezaId="p" version={1} acciones={["descartar"]} />)
    const descartar = screen.getByRole("button", { name: "Descartar esta pieza" })
    expect(descartar).toHaveClass("text-error")
    fireEvent.click(descartar)
    expect(descartarAccion).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Sí, descartar" }))
    await waitFor(() => expect(descartarAccion).toHaveBeenCalledWith("p", 1))
  })

  it("lets her go back from the discard question without discarding", () => {
    render(<AccionesDeEstado piezaId="p" version={1} acciones={["descartar"]} />)
    fireEvent.click(screen.getByRole("button", { name: "Descartar esta pieza" }))
    fireEvent.click(screen.getByRole("button", { name: "Volver" }))
    expect(descartarAccion).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Descartar esta pieza" })).toBeInTheDocument()
  })

  it("retries at once, with the main button, without asking", async () => {
    render(<AccionesDeEstado piezaId="p" version={2} acciones={["reintentar", "descartar"]} />)
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }))
    await waitFor(() => expect(reintentarAccion).toHaveBeenCalledWith("p", 2))
  })
})
