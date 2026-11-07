import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

type Respuesta = { ok: true } | { ok: false; error: string }

const { proponerAhoraAccion, push, replace } = vi.hoisted(() => ({
  proponerAhoraAccion: vi.fn(async (): Promise<Respuesta> => ({ ok: true })),
  push: vi.fn(),
  replace: vi.fn(),
}))
vi.mock("@/app/(app)/biblioteca/semana/acciones", () => ({ proponerAhoraAccion }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn(), replace }) }))

import { BotonProponerAhora } from "@/app/(app)/biblioteca/semana/boton-proponer-ahora"

const YA_PROPUSO = "El motor ya propuso ideas esta semana. Puedes pedir otras desde el lunes."
const PEDIDO = "El motor se puso a trabajar. Las ideas llegan a Ideas en unos minutos."

beforeEach(() => vi.clearAllMocks())

describe("BotonProponerAhora", () => {
  it("says what it costs under the button, and the button is described by it (4a)", () => {
    render(<BotonProponerAhora costoUsd={0.25} />)
    expect(screen.getByRole("button", { name: "Proponer ahora" })).toHaveAccessibleDescription(
      "Cuesta cerca de US$ 0,25",
    )
  })

  it("asks the engine, says it is on its way and redraws the screen", async () => {
    render(<BotonProponerAhora costoUsd={0.25} />)
    fireEvent.click(screen.getByRole("button", { name: "Proponer ahora" }))
    expect(await screen.findByRole("status")).toHaveTextContent(PEDIDO)
    expect(proponerAhoraAccion).toHaveBeenCalledTimes(1)
    expect(replace).toHaveBeenCalledWith(expect.stringMatching(/[?&]v=\d+/), { scroll: false })
  })

  it("says a refusal in an error line, with no note and no redraw", async () => {
    proponerAhoraAccion.mockResolvedValueOnce({ ok: false, error: YA_PROPUSO })
    render(<BotonProponerAhora costoUsd={0.25} />)
    fireEvent.click(screen.getByRole("button", { name: "Proponer ahora" }))
    expect(await screen.findByRole("alert")).toHaveTextContent(YA_PROPUSO)
    expect(screen.queryByText(PEDIDO)).toBeNull()
    expect(replace).not.toHaveBeenCalled()
  })

  it("sends her to sign in when the session ended", async () => {
    proponerAhoraAccion.mockResolvedValueOnce({ ok: false, error: "Tu sesión venció. Entra de nuevo." })
    render(<BotonProponerAhora costoUsd={0.25} />)
    fireEvent.click(screen.getByRole("button", { name: "Proponer ahora" }))
    await waitFor(() => expect(push).toHaveBeenCalledWith("/ingreso"))
  })

  it("ignores a second tap while the first is on its way", async () => {
    render(<BotonProponerAhora costoUsd={0.25} />)
    const boton = screen.getByRole("button", { name: "Proponer ahora" })
    fireEvent.click(boton)
    fireEvent.click(boton)
    await screen.findByRole("status")
    expect(proponerAhoraAccion).toHaveBeenCalledTimes(1)
  })
})
