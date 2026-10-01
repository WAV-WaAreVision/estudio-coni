import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ConsultaNueva } from "@/app/(app)/consulta-nueva"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))

function armar(sobre: Partial<Parameters<typeof ConsultaNueva>[0]> = {}) {
  const alAnotar = vi.fn().mockResolvedValue({ ok: true, id: "c1", totalDelMes: 3 })
  const alDeshacer = vi.fn().mockResolvedValue({ ok: true, totalDelMes: 2 })
  render(<ConsultaNueva total={2} mes="octubre" alAnotar={alAnotar} alDeshacer={alDeshacer} {...sobre} />)
  return { alAnotar, alDeshacer }
}

describe("ConsultaNueva", () => {
  it("says how many consultations the month has, in plain words", () => {
    armar({ total: 2 })
    expect(screen.getByText("2 consultas en octubre")).toBeInTheDocument()
  })

  it("reads well with none and with one", () => {
    const { unmount } = render(<ConsultaNueva total={0} mes="octubre" alAnotar={vi.fn()} alDeshacer={vi.fn()} />)
    expect(screen.getByText("Todavía ninguna en octubre")).toBeInTheDocument()
    unmount()
    render(<ConsultaNueva total={1} mes="octubre" alAnotar={vi.fn()} alDeshacer={vi.fn()} />)
    expect(screen.getByText("1 consulta en octubre")).toBeInTheDocument()
  })

  it("notes a consultation with one tap and shows the new total with a way to take it back", async () => {
    const { alAnotar } = armar()

    fireEvent.click(screen.getByRole("button", { name: "Llegó una consulta" }))

    await waitFor(() => expect(screen.getByText("3 consultas en octubre")).toBeInTheDocument())
    expect(alAnotar).toHaveBeenCalledTimes(1)
    expect(screen.getByText("Anotada. Van 3 en octubre.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Deshacer" })).toBeInTheDocument()
  })

  it("takes the tap back with Deshacer and goes back to the previous total", async () => {
    const { alDeshacer } = armar()
    fireEvent.click(screen.getByRole("button", { name: "Llegó una consulta" }))
    await waitFor(() => screen.getByRole("button", { name: "Deshacer" }))

    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }))

    await waitFor(() => expect(screen.getByText("2 consultas en octubre")).toBeInTheDocument())
    expect(alDeshacer).toHaveBeenCalledWith("c1")
  })

  it("does not count twice while the first tap is still being saved", async () => {
    const { promise, resolve: terminar } = Promise.withResolvers<unknown>()
    const alAnotar = vi.fn().mockReturnValue(promise)
    armar({ alAnotar })

    const boton = screen.getByRole("button", { name: "Llegó una consulta" })
    fireEvent.click(boton)
    fireEvent.click(boton)

    expect(alAnotar).toHaveBeenCalledTimes(1)
    terminar({ ok: true, id: "c1", totalDelMes: 3 })
    await waitFor(() => expect(screen.getByText("3 consultas en octubre")).toBeInTheDocument())
  })

  it("keeps the total and says what happened when saving fails", async () => {
    const alAnotar = vi.fn().mockResolvedValue({ ok: false, error: "Algo falló de nuestro lado." })
    armar({ alAnotar })

    fireEvent.click(screen.getByRole("button", { name: "Llegó una consulta" }))

    expect(await screen.findByText("Algo falló de nuestro lado.")).toBeInTheDocument()
    expect(screen.getByText("2 consultas en octubre")).toBeInTheDocument()
  })
})
