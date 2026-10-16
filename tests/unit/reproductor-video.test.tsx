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

  it("is the 9:16 frame at 9.5 by 16.9rem, centred and raised, with Avatar IA and a seek slider", () => {
    render(<ReproductorVideo src="https://almacen.test/v.mp4" clave="v3" zonas={false} alVerCompleto={vi.fn()} />)
    expect(screen.getByTestId("reproductor-video")).toHaveClass(
      "w-[9.5rem]",
      "h-[16.9rem]",
      "mx-auto",
      "rounded-video",
      "shadow-relieve",
    )
    expect(screen.getByText("Avatar IA")).toBeInTheDocument()
    expect(screen.getByRole("slider", { name: "Avance del video" })).toHaveClass("avance", "sobre-video")
  })

  it("says what is left while it plays, under Avatar IA", () => {
    const { container } = render(
      <ReproductorVideo src="https://almacen.test/v.mp4" clave="v4" zonas={false} alVerCompleto={vi.fn()} />,
    )
    const video = container.querySelector("video")
    if (!video) throw new Error("No hay video")
    Object.defineProperty(video, "duration", { value: 58, configurable: true })
    Object.defineProperty(video, "currentTime", { value: 34, configurable: true })
    fireEvent.play(video)
    fireEvent.timeUpdate(video)
    const faltan = screen.getByText("faltan 0:24")
    expect(faltan.parentElement).toContainElement(screen.getByText("Avatar IA"))
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
