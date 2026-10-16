import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DeshacerFirma } from "@/app/(app)/guion/[id]/deshacer-firma"
import { TEXTO_DESHACER_TARDE } from "@/lib/dominio/estados"

const { deshacerAprobacionAccion, replace } = vi.hoisted(() => ({
  deshacerAprobacionAccion: vi.fn(),
  replace: vi.fn(),
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace }) }))
vi.mock("@/app/(app)/piezas/acciones", () => ({ deshacerAprobacionAccion }))

beforeEach(() => {
  deshacerAprobacionAccion.mockReset()
  replace.mockReset()
})

afterEach(() => vi.useRealTimers())

describe("DeshacerFirma", () => {
  it("says the video starts in 8 s and undoes it, back to the script with its own toast", async () => {
    deshacerAprobacionAccion.mockResolvedValue({ ok: true })
    render(<DeshacerFirma piezaId="p1" version={6} quedanMs={8000} />)
    expect(screen.getByText("Firmaste. Grabo el video en 8 s.")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }))

    expect(deshacerAprobacionAccion).toHaveBeenCalledWith("p1", 6)
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/guion/p1?deshecho=1"))
  })

  it("undoes the version she signed at even after a refresh brings a newer one", async () => {
    deshacerAprobacionAccion.mockResolvedValue({ ok: false, error: TEXTO_DESHACER_TARDE })
    const { rerender } = render(<DeshacerFirma piezaId="p1" version={6} quedanMs={8000} />)

    // The screen polls every 4 s: once the render claims the piece, the row's version moves on.
    rerender(<DeshacerFirma piezaId="p1" version={7} quedanMs={4000} />)
    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }))

    expect(deshacerAprobacionAccion).toHaveBeenCalledWith("p1", 6)
    expect(await screen.findByText(TEXTO_DESHACER_TARDE)).toBeInTheDocument()
  })

  it("tells her when the undo came too late, and stays on the video", async () => {
    deshacerAprobacionAccion.mockResolvedValue({ ok: false, error: TEXTO_DESHACER_TARDE })
    render(<DeshacerFirma piezaId="p1" version={6} quedanMs={8000} />)

    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }))

    expect(await screen.findByText(TEXTO_DESHACER_TARDE)).toBeInTheDocument()
    expect(replace).not.toHaveBeenCalled()
  })

  it("goes away when the window closes, and a refresh does not restart it", () => {
    vi.useFakeTimers()
    const { rerender } = render(<DeshacerFirma piezaId="p1" version={6} quedanMs={3000} />)

    act(() => {
      vi.advanceTimersByTime(2000)
    })
    rerender(<DeshacerFirma piezaId="p1" version={6} quedanMs={2500} />)
    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(screen.queryByText("Firmaste. Grabo el video en 8 s.")).toBeNull()
  })

  it("says exactly 8 s for a fresh signature, the request having taken a moment", () => {
    render(<DeshacerFirma piezaId="p1" version={6} quedanMs={7800} />)
    expect(screen.getByText("Firmaste. Grabo el video en 8 s.")).toBeInTheDocument()
  })

  it("says the seconds really left when the screen opens mid-window", () => {
    render(<DeshacerFirma piezaId="p1" version={6} quedanMs={4200} />)
    expect(screen.getByText("Firmaste. Grabo el video en 5 s.")).toBeInTheDocument()
  })

  it("puts her focus on 'Deshacer' as it appears", () => {
    render(<DeshacerFirma piezaId="p1" version={6} quedanMs={8000} />)
    expect(screen.getByRole("button", { name: "Deshacer" })).toHaveFocus()
  })

  it("shows 'Deshaciendo…' while the undo is on its way, and closes on a refusal that it shows", async () => {
    let responder: (resultado: { ok: false; error: string }) => void = () => undefined
    deshacerAprobacionAccion.mockReturnValue(
      new Promise((resolver) => {
        responder = resolver
      }),
    )
    render(<DeshacerFirma piezaId="p1" version={6} quedanMs={8000} />)

    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }))
    expect(await screen.findByRole("button", { name: "Deshaciendo…" })).toHaveAttribute("aria-disabled", "true")
    expect(screen.getByText("Firmaste. Grabo el video en 8 s.")).toBeInTheDocument()

    await act(async () => responder({ ok: false, error: TEXTO_DESHACER_TARDE }))

    expect(screen.getByText(TEXTO_DESHACER_TARDE)).toBeInTheDocument()
    expect(screen.queryByText("Firmaste. Grabo el video en 8 s.")).toBeNull()
  })
})
