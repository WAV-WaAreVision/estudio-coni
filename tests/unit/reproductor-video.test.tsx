import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ReproductorVideo } from "@/components/reproductor-video"

describe("ReproductorVideo", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("plays or pauses when the frame is tapped anywhere", () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue()
    render(<ReproductorVideo src="https://almacen.test/v.mp4" clave="v1" zonas={false} alVerCompleto={vi.fn()} />)
    fireEvent.click(screen.getByTestId("reproductor-video"))
    expect(play).toHaveBeenCalledTimes(1)
  })

  it("plays once, not twice, when the play button itself is tapped", () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue()
    render(<ReproductorVideo src="https://almacen.test/v.mp4" clave="v2" zonas={false} alVerCompleto={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "Reproducir el video" }))
    expect(play).toHaveBeenCalledTimes(1)
  })

  it("keeps the labelled play button, the Avatar IA label and a seek slider", () => {
    render(<ReproductorVideo src="https://almacen.test/v.mp4" clave="v3" zonas={false} alVerCompleto={vi.fn()} />)
    expect(screen.getByRole("button", { name: "Reproducir el video" })).toBeInTheDocument()
    expect(screen.getByText("Avatar IA")).toBeInTheDocument()
    expect(screen.getByRole("slider", { name: "Avance del video" })).toBeInTheDocument()
  })

  it("fits above the sign bar: the height comes from the dynamic viewport, never from vh", () => {
    render(<ReproductorVideo src="https://almacen.test/v.mp4" clave="v4" zonas={false} alVerCompleto={vi.fn()} />)
    const estilo = screen.getByTestId("reproductor-video").getAttribute("style") ?? ""
    expect(estilo).toContain("100dvh")
    expect(estilo).not.toMatch(/\d\s*vh/)
  })

  it("says a load failure under the video, not in the middle of the frame", () => {
    render(<ReproductorVideo src={null} clave="v5" zonas={false} alVerCompleto={vi.fn()} />)
    const alerta = screen.getByRole("alert")
    expect(alerta).toHaveTextContent("No pude cargar el video. Recarga la pantalla.")
    expect(screen.getByTestId("reproductor-video").contains(alerta)).toBe(false)
  })

  it("shows the Instagram zones only when asked, with their caption", () => {
    const { rerender } = render(
      <ReproductorVideo src="https://almacen.test/v.mp4" clave="v6" zonas={false} alVerCompleto={vi.fn()} />,
    )
    expect(screen.queryByText("Aquí Instagram pone el texto y los botones")).toBeNull()
    rerender(<ReproductorVideo src="https://almacen.test/v.mp4" clave="v6" zonas alVerCompleto={vi.fn()} />)
    expect(screen.getByText("Aquí Instagram pone el texto y los botones")).toBeInTheDocument()
  })
})
