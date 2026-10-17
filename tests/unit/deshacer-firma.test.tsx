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
  it("says she signed and when the video starts, politely, with Deshacer focused", () => {
    render(<DeshacerFirma piezaId="p1" version={6} quedanMs={8000} />)
    expect(screen.getByRole("status")).toHaveTextContent("Firmaste")
    expect(screen.getByText("Grabo tu video en 8 s")).toHaveClass("text-pieza")
    expect(screen.getByText("Si te arrepientes, deshazlo ahora. No se cobra nada.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Deshacer" })).toHaveFocus()
  })

  it("undoes the version she signed at and goes back to the script with its own toast", async () => {
    deshacerAprobacionAccion.mockResolvedValue({ ok: true })
    render(<DeshacerFirma piezaId="p1" version={6} quedanMs={8000} />)
    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }))
    expect(deshacerAprobacionAccion).toHaveBeenCalledWith("p1", 6)
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/guion/p1?deshecho=1"))
  })

  it("undoes the version she signed at even after a refresh brings a newer one", () => {
    deshacerAprobacionAccion.mockReturnValue(new Promise(() => undefined))
    const { rerender } = render(<DeshacerFirma piezaId="p1" version={6} quedanMs={8000} />)
    rerender(<DeshacerFirma piezaId="p1" version={7} quedanMs={4000} />)
    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }))
    expect(deshacerAprobacionAccion).toHaveBeenCalledWith("p1", 6)
  })

  it("says 'Deshaciendo…' while the undo is on its way", async () => {
    deshacerAprobacionAccion.mockReturnValue(new Promise(() => undefined))
    render(<DeshacerFirma piezaId="p1" version={6} quedanMs={8000} />)
    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }))
    expect(await screen.findByRole("button", { name: "Deshaciendo…" })).toHaveAttribute("aria-busy", "true")
  })

  it("shows a refused undo in place, and the recording going on", async () => {
    deshacerAprobacionAccion.mockResolvedValue({ ok: false, error: TEXTO_DESHACER_TARDE })
    render(<DeshacerFirma piezaId="p1" version={6} quedanMs={8000} />)
    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }))
    expect(await screen.findByRole("alert")).toHaveTextContent(TEXTO_DESHACER_TARDE)
    expect(screen.getByText("Estoy grabando tu video.")).toBeInTheDocument()
    expect(replace).not.toHaveBeenCalled()
  })

  it("moves to the recording when the window ends, and a refresh does not reopen it", () => {
    vi.useFakeTimers()
    const { rerender } = render(<DeshacerFirma piezaId="p1" version={6} quedanMs={3000} />)
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    rerender(<DeshacerFirma piezaId="p1" version={6} quedanMs={2500} />)
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.queryByRole("button", { name: "Deshacer" })).toBeNull()
    expect(screen.getByText("Firmaste")).toBeInTheDocument()
    expect(screen.getByText("Estoy grabando tu video.")).toHaveClass("text-pieza")
    expect(screen.getByText("Unos 5 min. Te aviso cuando esté listo.")).toBeInTheDocument()
  })

  it("says the seconds really left when the screen opens mid-window", () => {
    render(<DeshacerFirma piezaId="p1" version={6} quedanMs={4200} />)
    expect(screen.getByText("Grabo tu video en 5 s")).toBeInTheDocument()
  })

  it("shows the recording at once on a later visit, with no undo", () => {
    render(<DeshacerFirma piezaId="p1" version={6} quedanMs={0} />)
    expect(screen.queryByRole("button", { name: "Deshacer" })).toBeNull()
    expect(screen.getByText("Estoy grabando tu video.")).toBeInTheDocument()
  })
})
