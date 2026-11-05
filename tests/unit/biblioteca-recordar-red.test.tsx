import { render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { recordarRedAccion } = vi.hoisted(() => ({
  recordarRedAccion: vi.fn(
    async (..._: unknown[]): Promise<{ ok: true } | { ok: false; error: string }> => ({ ok: true }),
  ),
}))
vi.mock("@/app/(app)/biblioteca/acciones", () => ({ recordarRedAccion }))

import { RecordarRed } from "@/app/(app)/biblioteca/temas/recordar-red"

beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.restoreAllMocks())

describe("RecordarRed", () => {
  it("records the network on screen after mount when it differs from the stored one", async () => {
    render(<RecordarRed red="instagram" recordada="linkedin" />)
    await waitFor(() => expect(recordarRedAccion).toHaveBeenCalledWith({ red: "instagram" }))
    expect(recordarRedAccion).toHaveBeenCalledTimes(1)
  })

  it("records the first network too, when nothing is stored yet", async () => {
    render(<RecordarRed red="linkedin" recordada={null} />)
    await waitFor(() => expect(recordarRedAccion).toHaveBeenCalledWith({ red: "linkedin" }))
  })

  it("writes nothing when the network on screen is the stored one", () => {
    const { rerender } = render(<RecordarRed red="linkedin" recordada="linkedin" />)
    rerender(<RecordarRed red="linkedin" recordada="linkedin" />)
    expect(recordarRedAccion).not.toHaveBeenCalled()
  })

  it("shows nothing when it fails, but logs the refusal and the error", async () => {
    const consola = vi.spyOn(console, "error").mockImplementation(() => undefined)
    recordarRedAccion.mockResolvedValueOnce({ ok: false, error: "Esta app es solo para Coni." })
    const { container } = render(<RecordarRed red="instagram" recordada={null} />)
    await waitFor(() =>
      expect(consola).toHaveBeenCalledWith("No pude recordar la red instagram: Esta app es solo para Coni."),
    )
    expect(container).toBeEmptyDOMElement()
    recordarRedAccion.mockRejectedValueOnce(new Error("sin red"))
    render(<RecordarRed red="linkedin" recordada={null} />)
    await waitFor(() => expect(consola).toHaveBeenCalledWith("No pude recordar la red linkedin", expect.any(Error)))
  })
})
