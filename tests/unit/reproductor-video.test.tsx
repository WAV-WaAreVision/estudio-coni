import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ReproductorVideo } from "@/components/reproductor-video"
import { recordarVisto } from "@/lib/medios/recuerdo"

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

  it("is the 9:16 frame at the column width, capped so it fits above the bar, raised, with Avatar IA and a seek slider", () => {
    render(<ReproductorVideo src="https://almacen.test/v.mp4" clave="v3" zonas={false} alVerCompleto={vi.fn()} />)
    const marco = screen.getByTestId("reproductor-video")
    expect(marco).toHaveClass("w-full", "aspect-[9/16]", "mx-auto", "rounded-video", "shadow-relieve")
    expect(marco.className).toMatch(/max-w-\[calc\(\(100svh/)
    expect(marco.className).not.toMatch(/w-\[9\.5rem\]|h-\[16\.9rem\]/)
    expect(screen.getByText("Avatar IA")).toBeInTheDocument()
    expect(screen.getByRole("slider", { name: "Avance del video" })).toHaveClass("avance", "sobre-video")
  })

  it("keeps play, the rail and the time in one row on the bottom strip, so the lips and subtitles stay clear", () => {
    render(<ReproductorVideo src="https://almacen.test/v.mp4" clave="v7" zonas={false} alVerCompleto={vi.fn()} />)
    const play = screen.getByRole("button", { name: "Reproducir el video" })
    const fila = play.parentElement as HTMLElement
    expect(fila).toContainElement(screen.getByRole("slider", { name: "Avance del video" }))
    expect(fila).toHaveClass("flex", "items-center")
    expect(fila.closest(".absolute")).toHaveClass("bottom-2.5")
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

  it("does not look ready before she watched it: says so over the frame, and play stays open to start", () => {
    render(<ReproductorVideo src="https://almacen.test/v.mp4" clave="v8" zonas={false} alVerCompleto={vi.fn()} />)
    const estado = screen.getByText("Míralo completo para poder firmar")
    expect(screen.getByTestId("reproductor-video")).toContainElement(estado)
    // The video is finished: watching it is how she opens the signature, so play is never closed here.
    expect(screen.getByRole("button", { name: "Reproducir el video" })).toBeEnabled()
  })

  it("drops the state over the frame once it plays", () => {
    const { container } = render(
      <ReproductorVideo src="https://almacen.test/v.mp4" clave="v9" zonas={false} alVerCompleto={vi.fn()} />,
    )
    const video = container.querySelector("video")
    if (!video) throw new Error("No hay video")
    expect(screen.getByText("Míralo completo para poder firmar")).toBeInTheDocument()
    fireEvent.play(video)
    expect(screen.queryByText("Míralo completo para poder firmar")).toBeNull()
  })

  it("does not show the state on a video she already watched whole", () => {
    const sinVer = render(
      <ReproductorVideo src="https://almacen.test/v.mp4" clave="v10" zonas={false} alVerCompleto={vi.fn()} />,
    )
    expect(screen.getByText("Míralo completo para poder firmar")).toBeInTheDocument()
    sinVer.unmount()
    recordarVisto("v10")
    render(<ReproductorVideo src="https://almacen.test/v.mp4" clave="v10" zonas={false} alVerCompleto={vi.fn()} />)
    expect(screen.queryByText("Míralo completo para poder firmar")).toBeNull()
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
