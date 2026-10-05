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

  it("plays and pauses from one 48 px button", async () => {
    render(<ReproductorVoz src="https://almacen.test/voz.mp3" clave="voz-1" alEscuchar={vi.fn()} />)

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Escuchar la voz" }))
    })

    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("button", { name: "Escuchar la voz" })).toHaveClass("size-12")
  })

  it("reports that she listened once she heard 95 percent, and says so", () => {
    const alEscuchar = vi.fn()
    const { container } = render(
      <ReproductorVoz src="https://almacen.test/voz.mp3" clave="voz-2" alEscuchar={alEscuchar} />,
    )

    reproducir(audio(container), 0, SEGUNDOS)

    expect(alEscuchar).toHaveBeenCalledTimes(1)
    expect(screen.getByText("Ya la escuchaste")).toBeInTheDocument()
  })

  it("does not count skipping to the end", () => {
    const alEscuchar = vi.fn()
    const { container } = render(
      <ReproductorVoz src="https://almacen.test/voz.mp3" clave="voz-3" alEscuchar={alEscuchar} />,
    )

    const elemento = audio(container)
    reproducir(elemento, 0, 2)
    reproducir(elemento, 19, SEGUNDOS)

    expect(alEscuchar).not.toHaveBeenCalled()
  })

  it("remembers she listened when she comes back to the screen", () => {
    const alEscuchar = vi.fn()
    const primera = render(<ReproductorVoz src="https://almacen.test/voz.mp3" clave="voz-4" alEscuchar={alEscuchar} />)
    reproducir(audio(primera.container), 0, SEGUNDOS)
    primera.unmount()

    const alEscucharOtraVez = vi.fn()
    render(<ReproductorVoz src="https://almacen.test/voz.mp3" clave="voz-4" alEscuchar={alEscucharOtraVez} />)

    expect(screen.getByText("Ya la escuchaste")).toBeInTheDocument()
    expect(alEscucharOtraVez).toHaveBeenCalledTimes(1)
  })

  it("says when the voice cannot be loaded", () => {
    render(<ReproductorVoz src={null} clave="voz-5" alEscuchar={vi.fn()} />)

    expect(screen.getByText("No pude cargar la voz. Recarga la pantalla.")).toBeInTheDocument()
  })

  it("draws play as an outline so the principal stays the only filled shape", () => {
    render(<ReproductorVoz src="https://almacen.test/voz.mp3" clave="voz-6" alEscuchar={vi.fn()} />)

    const boton = screen.getByRole("button", { name: "Escuchar la voz" })
    expect(boton).toHaveClass("ring-tinta")
    expect(boton.className).not.toMatch(/\bbg-(principal|firma|tinta)\b/)
  })

  it("lets her seek with a slider and reads the time in tabular figures", () => {
    render(<ReproductorVoz src="https://almacen.test/voz.mp3" clave="voz-7" alEscuchar={vi.fn()} />)

    expect(screen.getByRole("slider", { name: "Avance de la voz" })).toBeInTheDocument()
    expect(screen.getByText(/0:00 \/ /)).toHaveClass("tabular-nums")
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

  it("says she listened with a check, in the success ink", () => {
    const { container } = render(
      <ReproductorVoz src="https://almacen.test/voz.mp3" clave="voz-9" alEscuchar={vi.fn()} />,
    )
    reproducir(audio(container), 0, SEGUNDOS)

    expect(screen.getByText("Ya la escuchaste")).toHaveClass("text-exito")
  })
})
