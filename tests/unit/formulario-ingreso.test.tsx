import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/app/ingreso/acciones", () => ({
  pedirCodigoAccion: vi.fn(async () => ({ ok: true })),
  verificarCodigoAccion: vi.fn(async () => ({ ok: false, error: "Ese código no sirve o ya venció. Pide otro." })),
}))

import { FormularioIngreso } from "@/app/ingreso/formulario-ingreso"

describe("FormularioIngreso", () => {
  // An invariant through Boton, not a regression guard: this form was not part of the fix that muted disabled labels.
  it("keeps Entrar disabled, muted and flat while the code is incomplete", async () => {
    render(<FormularioIngreso correoEnmascarado="c•••@estudio.test" />)
    fireEvent.click(screen.getByRole("button", { name: "Mandarme el código" }))
    const entrar = await screen.findByRole("button", { name: "Entrar" })
    expect(entrar).toHaveAttribute("aria-disabled", "true")
    expect(entrar).toHaveClass("aria-disabled:text-apagado", "aria-disabled:shadow-none")
    fireEvent.change(screen.getAllByRole("textbox")[0] as HTMLElement, { target: { value: "1" } })
    await waitFor(() => expect(screen.getByRole("button", { name: "Entrar" })).toHaveAttribute("aria-disabled", "true"))
  })
})
