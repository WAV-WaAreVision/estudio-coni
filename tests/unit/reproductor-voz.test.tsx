import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ReproductorVoz } from "@/components/reproductor-voz"

const SEGUNDOS = 20

function audio(contenedor: HTMLElement): HTMLAudioElement {
  const elemento = contenedor.querySelector("audio")
  if (!elemento) throw new Error("No hay audio")
  Object.defineProperty(elemento, "duration", { value: SEGUNDOS, configurable: true })
  return elemento
}

function reproducir(elemento: HTMLAudioElement, desde: number, hasta: number) {
  for (let t = desde; t <= hasta + 1e-9; t += 0.25) {
    Object.defineProperty(elemento, "currentTime", { value: t, configurable: true })
    fireEvent.timeUpdate(elemento)
  }
}

describe("ReproductorVoz", () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined)
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined)
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("plays from one raised 3.5rem circle that sinks when pressed", async () => {
    render(<ReproductorVoz src="https://almacen.test/voz.mp3" clave="voz-1" alEscuchar={vi.fn()} />)
    const boton = screen.getByRole("button", { name: "Escuchar la voz" })
    await act(async () => {
      fireEvent.click(boton)
    })
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1)
    expect(boton).toHaveClass("size-play", "bg-piedra", "shadow-relieve", "active:shadow-hundido")
  })

  it("puts the play and the time on one row and the rail under them", () => {
    render(<ReproductorVoz src="https://almacen.test/voz.mp3" clave="voz-2" alEscuchar={vi.fn()} />)
    const fila = screen.getByRole("button", { name: "Escuchar la voz" }).parentElement
    expect(fila).toContainElement(screen.getByText(/0:00 \/ /))
    expect(fila).not.toContainElement(screen.getByRole("slider", { name: "Avance de la voz" }))
    expect(screen.getByText(/0:00 \/ /)).toHaveClass("text-meta", "font-semibold", "tabular-nums")
  })

  it("reports that she listened once she heard 95 percent, with the ok pill", () => {
    const alEscuchar = vi.fn()
    const { container } = render(
      <ReproductorVoz src="https://almacen.test/voz.mp3" clave="voz-3" alEscuchar={alEscuchar} />,
    )
    reproducir(audio(container), 0, SEGUNDOS)
    expect(alEscuchar).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("status")).toHaveTextContent("La escuchaste completa")
  })

  it("does not count skipping to the end", () => {
    const alEscuchar = vi.fn()
    const { container } = render(
      <ReproductorVoz src="https://almacen.test/voz.mp3" clave="voz-4" alEscuchar={alEscuchar} />,
    )
    const elemento = audio(container)
    reproducir(elemento, 0, 2)
    reproducir(elemento, 19, SEGUNDOS)
    expect(alEscuchar).not.toHaveBeenCalled()
    expect(screen.queryByText("La escuchaste completa")).toBeNull()
  })

  it("remembers she listened when she comes back to the screen", () => {
    const primera = render(<ReproductorVoz src="https://almacen.test/voz.mp3" clave="voz-5" alEscuchar={vi.fn()} />)
    reproducir(audio(primera.container), 0, SEGUNDOS)
    primera.unmount()

    const alEscucharOtraVez = vi.fn()
    render(<ReproductorVoz src="https://almacen.test/voz.mp3" clave="voz-5" alEscuchar={alEscucharOtraVez} />)
    expect(screen.getByText("La escuchaste completa")).toBeInTheDocument()
    expect(alEscucharOtraVez).toHaveBeenCalledTimes(1)
  })

  it("names the play 'Escuchar de nuevo' once the voice ended", () => {
    const { container } = render(
      <ReproductorVoz src="https://almacen.test/voz.mp3" clave="voz-6" alEscuchar={vi.fn()} />,
    )
    fireEvent.ended(audio(container))
    expect(screen.getByRole("button", { name: "Escuchar de nuevo" })).toBeInTheDocument()
  })

  it("says when the voice cannot be loaded", () => {
    render(<ReproductorVoz src={null} clave="voz-7" alEscuchar={vi.fn()} />)
    expect(screen.getByRole("alert")).toHaveTextContent("No pude cargar la voz. Recarga la pantalla.")
  })

  it("moves the audio when she seeks, and a jump to the end does not count as listening", () => {
    const alEscuchar = vi.fn()
    const { container } = render(
      <ReproductorVoz src="https://almacen.test/voz.mp3" clave="voz-8" alEscuchar={alEscuchar} />,
    )
    const elemento = audio(container)
    fireEvent.loadedMetadata(elemento)
    fireEvent.change(screen.getByRole("slider", { name: "Avance de la voz" }), { target: { value: "19" } })
    expect(elemento.currentTime).toBe(19)
    reproducir(elemento, 19, SEGUNDOS)
    expect(alEscuchar).not.toHaveBeenCalled()
  })
})
