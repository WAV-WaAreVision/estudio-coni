import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { TipoDetectado } from "@/app/(app)/biblioteca/subir/tipo-detectado"

const YOUTUBE = { tipo: "link", etiqueta: "Video de YouTube" } as const

describe("TipoDetectado", () => {
  it("says the detected type as one fact with a quiet Cambiar", () => {
    render(<TipoDetectado efectivo={YOUTUBE} ocupado={false} alElegir={vi.fn()} />)
    expect(screen.getByText("Tipo: Video de YouTube")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Cambiar el tipo" })).toHaveTextContent("Cambiar")
  })

  it("opens a Tipo select with the six types and the current one chosen, with the focus on it", async () => {
    render(<TipoDetectado efectivo={YOUTUBE} ocupado={false} alElegir={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "Cambiar el tipo" }))

    const selector = screen.getByRole("combobox", { name: "Tipo" })
    expect(
      within(selector)
        .getAllByRole("option")
        .map((opcion) => opcion.getAttribute("value")),
    ).toEqual(["documento", "link", "audio", "video", "imagen", "post"])
    expect(selector).toHaveValue("link")
    expect(within(selector).getByRole("option", { name: "Enlace" })).toHaveProperty("selected", true)
    await waitFor(() => expect(selector).toHaveFocus())
  })

  it("changes the type from the select and stays open, so the arrow keys can go through every type", () => {
    const alElegir = vi.fn()
    const { rerender } = render(<TipoDetectado efectivo={YOUTUBE} ocupado={false} alElegir={alElegir} />)
    fireEvent.click(screen.getByRole("button", { name: "Cambiar el tipo" }))
    fireEvent.change(screen.getByRole("combobox", { name: "Tipo" }), { target: { value: "audio" } })
    expect(alElegir).toHaveBeenCalledWith("audio")

    rerender(<TipoDetectado efectivo={{ tipo: "audio", etiqueta: "Audio" }} ocupado={false} alElegir={alElegir} />)
    fireEvent.change(screen.getByRole("combobox", { name: "Tipo" }), { target: { value: "video" } })
    expect(alElegir.mock.calls).toEqual([["audio"], ["video"]])
    expect(screen.getByRole("combobox", { name: "Tipo" })).toBeInTheDocument()
  })

  it("keeps the current type when she opens the select and leaves it as it is", () => {
    const alElegir = vi.fn()
    render(<TipoDetectado efectivo={YOUTUBE} ocupado={false} alElegir={alElegir} />)
    fireEvent.click(screen.getByRole("button", { name: "Cambiar el tipo" }))
    fireEvent.blur(screen.getByRole("combobox", { name: "Tipo" }))
    expect(alElegir).not.toHaveBeenCalled()
    expect(screen.getByRole("combobox", { name: "Tipo" })).toHaveValue("link")
  })

  it("cannot be changed while uploading", () => {
    render(<TipoDetectado efectivo={YOUTUBE} ocupado alElegir={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "Cambiar el tipo" }))
    expect(screen.queryByRole("combobox", { name: "Tipo" })).toBeNull()
  })

  it("shows nothing while nothing was detected", () => {
    const { container } = render(<TipoDetectado efectivo={null} ocupado={false} alElegir={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
})
