import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

type R = { ok: true } | { ok: false; error: string }
const { reintentarMaterialAccion, push, replace } = vi.hoisted(() => ({
  reintentarMaterialAccion: vi.fn(async (..._: unknown[]): Promise<R> => ({ ok: true })),
  push: vi.fn(),
  replace: vi.fn(),
}))
vi.mock("@/app/(app)/biblioteca/acciones", () => ({ reintentarMaterialAccion }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn(), replace }) }))

import { BotonReintentar, PREGUNTA_REINTENTAR } from "@/app/(app)/biblioteca/boton-reintentar"

const ID = "11111111-2222-4333-8444-555555555555"

beforeEach(() => vi.clearAllMocks())

describe("BotonReintentar", () => {
  it("asks first, since retrying costs, and retries on yes", async () => {
    render(<BotonReintentar materialId={ID} />)
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }))
    expect(screen.getByText(PREGUNTA_REINTENTAR)).toBeInTheDocument()
    expect(reintentarMaterialAccion).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Sí, reintentar" }))
    await waitFor(() => expect(reintentarMaterialAccion).toHaveBeenCalledWith(ID))
  })

  it("Cancelar closes the question without retrying", () => {
    render(<BotonReintentar materialId={ID} />)
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }))
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }))
    expect(reintentarMaterialAccion).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument()
  })

  it("Cancelar gives the focus back to the button that asked", () => {
    render(<BotonReintentar materialId={ID} />)
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }))
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }))
    expect(screen.getByRole("button", { name: "Reintentar" })).toHaveFocus()
  })

  it("says a refusal under the question", async () => {
    reintentarMaterialAccion.mockResolvedValueOnce({ ok: false, error: "Ese material ya no se puede reintentar." })
    render(<BotonReintentar materialId={ID} />)
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }))
    fireEvent.click(screen.getByRole("button", { name: "Sí, reintentar" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Ese material ya no se puede reintentar.")
  })
})

// A refresh of the list's own address lost the race with its prefetches and left the button pending for ever: after an
// action that worked, the screen redraws on its own address with a fresh marker (useRedibujar).
describe("after an action that worked", () => {
  it("Reintentar redraws the screen on its own address", async () => {
    render(<BotonReintentar materialId={ID} />)
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }))
    fireEvent.click(screen.getByRole("button", { name: "Sí, reintentar" }))
    await waitFor(() => expect(replace).toHaveBeenCalledWith(expect.stringMatching(/^\/\?v=\d+$/), { scroll: false }))
  })

  it("a refusal does not redraw", async () => {
    reintentarMaterialAccion.mockResolvedValueOnce({ ok: false, error: "Ese material ya no se puede reintentar." })
    render(<BotonReintentar materialId={ID} />)
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }))
    fireEvent.click(screen.getByRole("button", { name: "Sí, reintentar" }))
    expect(await screen.findByText("Ese material ya no se puede reintentar.")).toBeInTheDocument()
    expect(replace).not.toHaveBeenCalled()
  })
})
