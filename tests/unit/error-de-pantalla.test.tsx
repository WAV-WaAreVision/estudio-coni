import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import ErrorDePantalla from "@/app/(app)/error"

const avisar = vi.fn()
vi.mock("@/app/(app)/acciones-avisar", () => ({
  avisarErrorDePantallaAccion: (...args: unknown[]) => avisar(...args),
}))

afterEach(() => avisar.mockReset())

describe("ErrorDePantalla", () => {
  it("says it as one error block, with the way forward as a secondary button", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    avisar.mockResolvedValue({ ok: true })
    const reset = vi.fn()
    const unstable_retry = vi.fn()
    render(<ErrorDePantalla error={new Error("boom")} reset={reset} unstable_retry={unstable_retry} />)

    const alerta = screen.getByRole("alert")
    expect(alerta).toHaveTextContent("No pude cargar esta pantalla.")
    expect(alerta).toHaveClass("bg-piedra-honda")
    expect(alerta.className).not.toMatch(/\bbg-(error|firma)\b/)
    fireEvent.click(screen.getByRole("button", { name: "Intentar de nuevo" }))
    // reset() alone re-renders without fetching again, so a failed server read would show the same error.
    expect(unstable_retry).toHaveBeenCalledTimes(1)
    expect(reset).not.toHaveBeenCalled()
  })

  it("tells WAV by itself and says Federico knows only once the email went out (issue 111)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    avisar.mockResolvedValue({ ok: true })
    const error = Object.assign(new Error("boom"), { digest: "123abc" })
    render(<ErrorDePantalla error={error} reset={vi.fn()} unstable_retry={vi.fn()} />)

    expect(screen.getByRole("alert")).not.toHaveTextContent("Federico")
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Le avisé a Federico."))
    expect(avisar).toHaveBeenCalledTimes(1)
    expect(avisar).toHaveBeenCalledWith({ registro: "Una pantalla no pudo cargar", digest: "123abc" })
  })

  it("keeps quiet about Federico when the email could not go out", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    avisar.mockResolvedValue({ ok: false, error: "Algo falló" })
    render(<ErrorDePantalla error={new Error("boom")} reset={vi.fn()} unstable_retry={vi.fn()} />)

    await waitFor(() => expect(avisar).toHaveBeenCalledTimes(1))
    expect(screen.getByRole("alert")).toHaveTextContent("Puede ser la conexión.")
    expect(screen.getByRole("alert")).not.toHaveTextContent("Federico")
  })

  it("drops «Le avisé a Federico.» when the retry fails again and that new email does not go out", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    avisar.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false, error: "Algo falló" })
    const { rerender } = render(<ErrorDePantalla error={new Error("uno")} reset={vi.fn()} unstable_retry={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Le avisé a Federico."))

    rerender(<ErrorDePantalla error={new Error("dos")} reset={vi.fn()} unstable_retry={vi.fn()} />)
    expect(screen.getByRole("alert")).not.toHaveTextContent("Federico")
    await waitFor(() => expect(avisar).toHaveBeenCalledTimes(2))
    expect(screen.getByRole("alert")).not.toHaveTextContent("Federico")
  })
})
