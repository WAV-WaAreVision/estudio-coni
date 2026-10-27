import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { descartarAccion } = vi.hoisted(() => ({
  descartarAccion: vi.fn(
    async (..._: unknown[]): Promise<{ ok: true } | { ok: false; error: string }> => ({ ok: true }),
  ),
}))
vi.mock("@/app/(app)/piezas/acciones", () => ({ descartarAccion }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

import { DescartarPieza, PREGUNTA_DESCARTAR_EN_LA_PUERTA } from "@/app/(app)/descartar-pieza"

beforeEach(() => vi.clearAllMocks())

describe("DescartarPieza", () => {
  it("asks first, with the destructive confirm in the error colour, and discards on yes", async () => {
    render(<DescartarPieza piezaId="p" version={4} />)
    fireEvent.click(screen.getByRole("button", { name: "Descartar esta pieza" }))
    expect(screen.getByText(PREGUNTA_DESCARTAR_EN_LA_PUERTA)).toBeInTheDocument()
    expect(descartarAccion).not.toHaveBeenCalled()
    const si = screen.getByRole("button", { name: "Sí, descartar" })
    expect(si).toHaveClass("text-error")
    fireEvent.click(si)
    await waitFor(() => expect(descartarAccion).toHaveBeenCalledWith("p", 4))
  })

  it("Cancelar closes the question without discarding", () => {
    render(<DescartarPieza piezaId="p" version={4} />)
    fireEvent.click(screen.getByRole("button", { name: "Descartar esta pieza" }))
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }))
    expect(descartarAccion).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Descartar esta pieza" })).toBeInTheDocument()
  })

  it("says a refusal inside the question", async () => {
    descartarAccion.mockResolvedValueOnce({
      ok: false,
      error: "Espera a que termine lo que estoy haciendo con esta pieza.",
    })
    render(<DescartarPieza piezaId="p" version={4} />)
    fireEvent.click(screen.getByRole("button", { name: "Descartar esta pieza" }))
    fireEvent.click(screen.getByRole("button", { name: "Sí, descartar" }))
    expect(await screen.findByText("Espera a que termine lo que estoy haciendo con esta pieza.")).toBeInTheDocument()
  })
})
