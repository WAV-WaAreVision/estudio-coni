import { render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { RecordarRed } from "@/app/(app)/biblioteca/temas/recordar-red"

const enviar = vi.fn(async (..._: unknown[]): Promise<Response> => new Response(null, { status: 204 }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal("fetch", enviar)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const PEDIDO = (red: string) => [
  "/biblioteca/temas/red-elegida",
  {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ red }),
    keepalive: true,
  },
]

describe("RecordarRed", () => {
  it("records the network on screen after mount when it differs from the stored one", async () => {
    render(<RecordarRed red="instagram" recordada="linkedin" />)
    await waitFor(() => expect(enviar).toHaveBeenCalledWith(...PEDIDO("instagram")))
    expect(enviar).toHaveBeenCalledTimes(1)
  })

  it("records the first network too, when nothing is stored yet", async () => {
    render(<RecordarRed red="linkedin" recordada={null} />)
    await waitFor(() => expect(enviar).toHaveBeenCalledWith(...PEDIDO("linkedin")))
  })

  it("writes nothing when the network on screen is the stored one", () => {
    const { rerender } = render(<RecordarRed red="linkedin" recordada="linkedin" />)
    rerender(<RecordarRed red="linkedin" recordada="linkedin" />)
    expect(enviar).not.toHaveBeenCalled()
  })

  it("shows nothing when it fails, but logs the refusal and the error", async () => {
    const consola = vi.spyOn(console, "error").mockImplementation(() => undefined)
    enviar.mockResolvedValueOnce(new Response("Esta app es solo para Coni.", { status: 403 }))
    const { container } = render(<RecordarRed red="instagram" recordada={null} />)
    await waitFor(() =>
      expect(consola).toHaveBeenCalledWith("No pude recordar la red instagram: Esta app es solo para Coni."),
    )
    expect(container).toBeEmptyDOMElement()
    enviar.mockRejectedValueOnce(new Error("sin red"))
    render(<RecordarRed red="linkedin" recordada={null} />)
    await waitFor(() => expect(consola).toHaveBeenCalledWith("No pude recordar la red linkedin", expect.any(Error)))
  })
})
