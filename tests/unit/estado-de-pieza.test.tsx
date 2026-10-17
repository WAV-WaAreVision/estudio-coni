import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { descartarAccion, reintentarAccion } = vi.hoisted(() => ({
  descartarAccion: vi.fn(async (..._: unknown[]) => ({ ok: true as const })),
  reintentarAccion: vi.fn(
    async (..._: unknown[]): Promise<{ ok: true } | { ok: false; error: string }> => ({ ok: true }),
  ),
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
  it("draws 'Descartar esta pieza' as a quiet action and asks with the raised destructive confirm", async () => {
    render(<AccionesDeEstado piezaId="p" version={1} acciones={["descartar"]} />)
    const descartar = screen.getByRole("button", { name: "Descartar esta pieza" })
    expect(descartar).toHaveClass("underline")
    expect(descartar.className).not.toMatch(/\btext-error\b|\bbg-/)
    fireEvent.click(descartar)
    expect(descartarAccion).not.toHaveBeenCalled()
    const si = screen.getByRole("button", { name: "Sí, descartar" })
    expect(si).toHaveClass("text-error", "bg-piedra")
    fireEvent.click(si)
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

  it("says a refused retry as its own alert block when it stands alone", async () => {
    reintentarAccion.mockResolvedValueOnce({ ok: false, error: "No pude reintentar." })
    render(<AccionesDeEstado piezaId="p" version={2} acciones={["reintentar"]} />)
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("No pude reintentar.")
  })

  it("inside an error block, says a refused retry as a plain error line: no block on the block, no second alert", async () => {
    reintentarAccion.mockResolvedValueOnce({ ok: false, error: "No pude reintentar." })
    render(<AccionesDeEstado piezaId="p" version={2} acciones={["reintentar"]} enUnError />)
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }))
    const linea = await screen.findByText("No pude reintentar.")
    expect(linea).toHaveClass("text-error", "font-semibold")
    expect(linea.closest(".bg-piedra-honda")).toBeNull()
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("says a refused discard inside the confirmation block it came from", async () => {
    descartarAccion.mockResolvedValueOnce({ ok: false, error: "No pude descartarla." } as never)
    render(<AccionesDeEstado piezaId="p" version={2} acciones={["descartar"]} />)
    fireEvent.click(screen.getByRole("button", { name: "Descartar esta pieza" }))
    fireEvent.click(screen.getByRole("button", { name: "Sí, descartar" }))
    const error = await screen.findByRole("alert")
    expect(error).toHaveTextContent("No pude descartarla.")
    expect(error.closest("[data-contorno]")).toContainElement(screen.getByRole("button", { name: "Sí, descartar" }))
    expect(screen.getAllByText("No pude descartarla.")).toHaveLength(1)
  })

  it("opens the discard question clean: a refused retry from before is not said inside it", async () => {
    reintentarAccion.mockResolvedValueOnce({ ok: false, error: "No pude reintentar." })
    render(<AccionesDeEstado piezaId="p" version={2} acciones={["reintentar", "descartar"]} />)
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }))
    await screen.findByText("No pude reintentar.")
    fireEvent.click(screen.getByRole("button", { name: "Descartar esta pieza" }))
    expect(screen.getByRole("button", { name: "Sí, descartar" })).toBeInTheDocument()
    expect(screen.queryByText("No pude reintentar.")).toBeNull()
  })
})
