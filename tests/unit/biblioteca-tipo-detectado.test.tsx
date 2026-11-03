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

  it("opens the six types with the current one marked, and gives the focus back to Cambiar after a choice", async () => {
    const alElegir = vi.fn()
    render(<TipoDetectado efectivo={YOUTUBE} ocupado={false} alElegir={alElegir} />)
    fireEvent.click(screen.getByRole("button", { name: "Cambiar el tipo" }))

    const grupo = screen.getByRole("group", { name: "¿Qué tipo de material es?" })
    expect(
      within(grupo)
        .getAllByRole("radio")
        .map((radio) => radio.getAttribute("value")),
    ).toEqual(["documento", "link", "audio", "video", "imagen", "post"])
    expect(within(grupo).getByRole("radio", { name: "Enlace" })).toBeChecked()

    fireEvent.click(within(grupo).getByRole("radio", { name: "Documento" }))
    expect(alElegir).toHaveBeenCalledWith("documento")
    expect(screen.queryByRole("group", { name: "¿Qué tipo de material es?" })).toBeNull()
    await waitFor(() => expect(screen.getByRole("button", { name: "Cambiar el tipo" })).toHaveFocus())
  })

  it("cannot be changed while uploading", () => {
    render(<TipoDetectado efectivo={YOUTUBE} ocupado alElegir={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "Cambiar el tipo" }))
    expect(screen.queryByRole("group", { name: "¿Qué tipo de material es?" })).toBeNull()
  })

  it("shows nothing while nothing was detected", () => {
    const { container } = render(<TipoDetectado efectivo={null} ocupado={false} alElegir={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
})
