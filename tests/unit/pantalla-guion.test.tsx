import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { type DatosDeGuion, PantallaGuion } from "@/app/(app)/guion/[id]/pantalla-guion"
import type { DatosDeGrabacion } from "@/lib/datos/grabacion"

const { aprobarGuionAccion, editarGuionAccion, pedirVozAccion, replace } = vi.hoisted(() => ({
  aprobarGuionAccion: vi.fn(),
  editarGuionAccion: vi.fn(),
  pedirVozAccion: vi.fn(),
  replace: vi.fn(),
}))

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace }) }))
vi.mock("@/app/(app)/piezas/acciones", () => ({
  aprobarGuionAccion,
  pedirVozAccion,
  pedirCambiosAccion: vi.fn(),
  editarGuionAccion,
  volverAVersionDeClaudeAccion: vi.fn(),
}))
// The player is a real <audio>: here it only says the take was heard to the end.
vi.mock("@/components/reproductor-voz", () => ({
  ReproductorVoz: ({ alEscuchar }: { alEscuchar: () => void }) => (
    <button type="button" onClick={alEscuchar}>
      Terminé de escuchar
    </button>
  ),
}))

const LINEA = "Al firmar grabo el video: ~52 s, US$ 3,48. Tienes 8 s para deshacer."
const VOZ = { url: "https://almacen.test/voces/p1/t-x-0.mp3", clave: "voces/p1/t-x-0.mp3" }
const BOTONES = {
  montoVoz: "US$ 0,33",
  unidadVoz: "~1.100 caracteres",
  saldoVoz: "ElevenLabs: te quedan 23.400 de 100.000 caracteres.",
  bloqueoVoz: null,
  bloqueoVideo: null,
}

function datos(sobre: Partial<DatosDeGuion> = {}, grabacion: Partial<DatosDeGrabacion> = {}): DatosDeGuion {
  return {
    id: "p1",
    version: 5,
    titulo: "El deseo no se apaga, se esconde",
    pilar: null,
    formato: null,
    segundos: 52,
    guion: "Hola, soy Coni. Soy Coni del Rosario.",
    texto: "Video hecho con mi avatar digital.",
    textoLinkedin: null,
    revision: [],
    tieneVersionDeClaude: false,
    salida: null,
    explicacion: null,
    avatares: [{ id: "look-a", nombre: "Estudio", imagenUrl: null }],
    avisoInicial: null,
    grabacion: { estado: "guion_por_aprobar", voz: VOZ, botones: BOTONES, lineaDeFirma: LINEA, ...grabacion },
    ...sobre,
  }
}

const aprobar = () => screen.getByRole("button", { name: "Aprobar" })
const elegirEstudio = () => fireEvent.click(screen.getByRole("radio", { name: "Estudio" }))
const escuchar = () => fireEvent.click(screen.getByRole("button", { name: "Terminé de escuchar" }))

beforeEach(() => {
  aprobarGuionAccion.mockReset().mockResolvedValue({ ok: true })
  editarGuionAccion.mockReset()
  pedirVozAccion.mockReset().mockResolvedValue({ ok: true })
  replace.mockReset()
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    width: 356,
    left: 0,
    right: 356,
    top: 0,
    bottom: 56,
    height: 56,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  })
  HTMLElement.prototype.setPointerCapture = vi.fn()
  HTMLElement.prototype.releasePointerCapture = vi.fn()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("PantallaGuion: la voz en la puerta 1", () => {
  it("shows her voice above the script and keeps the signature closed until she heard it to the end", async () => {
    render(<PantallaGuion datos={datos()} />)
    const voz = screen.getByRole("heading", { name: "Voz" })
    const guion = screen.getByRole("textbox", { name: "Guion" })
    expect(voz.compareDocumentPosition(guion) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    elegirEstudio()
    expect(screen.getByText("Escucha tu voz completa para firmar.")).toBeInTheDocument()
    expect(aprobar()).toHaveAttribute("aria-disabled", "true")

    escuchar()
    expect(aprobar()).not.toHaveAttribute("aria-disabled", "true")
    fireEvent.click(aprobar())
    await waitFor(() => expect(aprobarGuionAccion).toHaveBeenCalledWith("p1", 5, "look-a"))
  })

  it("asks her to listen again when another take of her voice arrives", () => {
    const { rerender } = render(<PantallaGuion datos={datos()} />)
    elegirEstudio()
    escuchar()
    expect(aprobar()).not.toHaveAttribute("aria-disabled", "true")

    const otra = { url: "https://almacen.test/voces/p1/t-x-1.mp3", clave: "voces/p1/t-x-1.mp3" }
    rerender(<PantallaGuion datos={datos({}, { voz: otra })} />)

    expect(screen.getByText("Escucha tu voz completa para firmar.")).toBeInTheDocument()
    expect(aprobar()).toHaveAttribute("aria-disabled", "true")
  })

  it("keeps her voice buttons closed while the script has unsaved changes", () => {
    render(<PantallaGuion datos={datos()} />)
    fireEvent.change(screen.getByRole("textbox", { name: "Guion" }), { target: { value: "Hola, soy Coni." } })

    const otraVez = screen.getByRole("button", { name: "Grabar la voz de nuevo" })
    expect(otraVez).toHaveAttribute("aria-disabled", "true")
    expect(otraVez).toHaveAccessibleDescription("Guarda tus cambios antes de grabar tu voz.")
  })

  it("says what the signature spends and how long she has to undo it, under the slider", () => {
    render(<PantallaGuion datos={datos()} />)
    const barra = screen.getByRole("region", { name: "Firma" })
    expect(within(barra).getByRole("slider", { name: "Desliza para aprobar y grabar" })).toBeInTheDocument()
    expect(within(barra).getByText(LINEA)).toBeInTheDocument()
  })

  it("without her voice of this script, asks to prepare it", async () => {
    render(<PantallaGuion datos={datos({}, { voz: null })} />)
    expect(screen.getAllByText("Falta preparar tu voz.")).toHaveLength(2)
    expect(aprobar()).toHaveAttribute("aria-disabled", "true")

    fireEvent.click(screen.getByRole("button", { name: "Preparar mi voz" }))
    await waitFor(() => expect(pedirVozAccion).toHaveBeenCalledWith("p1", 5, false))
  })

  it("makes a new take of the same text on request", async () => {
    render(<PantallaGuion datos={datos()} />)
    fireEvent.click(screen.getByRole("button", { name: "Grabar la voz de nuevo" }))
    await waitFor(() => expect(pedirVozAccion).toHaveBeenCalledWith("p1", 5, true))
  })

  it("while her voice is being made, shows the script read-only and keeps the signature closed", () => {
    render(<PantallaGuion datos={datos({}, { estado: "grabando_voz" })} />)
    expect(screen.getAllByText("Estoy preparando tu voz. Tarda unos segundos.")).toHaveLength(2)
    expect(screen.queryByRole("textbox", { name: "Guion" })).toBeNull()
    expect(screen.getByText("Hola, soy Coni. Soy Coni del Rosario.")).toBeInTheDocument()
    expect(aprobar()).toHaveAttribute("aria-disabled", "true")
  })

  it("keeps the signature closed with the HeyGen text when the wallet does not reach, even after listening", () => {
    const bloqueo = "Tu saldo de API de HeyGen no alcanza (te quedan US$ 0,00 y este video cuesta unos US$ 3,48)."
    render(<PantallaGuion datos={datos({}, { botones: { ...BOTONES, bloqueoVideo: bloqueo } })} />)
    elegirEstudio()
    escuchar()
    expect(screen.getByText(bloqueo)).toBeInTheDocument()
    expect(aprobar()).toHaveAttribute("aria-disabled", "true")
  })

  it("after an edit, signs and asks for her voice on the version the server returned", async () => {
    editarGuionAccion.mockResolvedValue({ ok: true, version: 7, revision: [] })
    render(<PantallaGuion datos={datos()} />)
    fireEvent.change(screen.getByRole("textbox", { name: "Texto de la publicación" }), {
      target: { value: "Video hecho con mi avatar digital. Cuéntame qué te pasa." },
    })
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }))
    await screen.findByText("Guardado")

    fireEvent.click(screen.getByRole("button", { name: "Grabar la voz de nuevo" }))
    await waitFor(() => expect(pedirVozAccion).toHaveBeenCalledWith("p1", 7, true))
    elegirEstudio()
    escuchar()
    fireEvent.click(aprobar())
    await waitFor(() => expect(aprobarGuionAccion).toHaveBeenCalledWith("p1", 7, "look-a"))
  })

  it("opens with the toast it was given, and takes it out of the address when it closes", () => {
    vi.useFakeTimers()
    render(<PantallaGuion datos={datos({ avisoInicial: "Listo, no grabé nada. Puedes seguir revisando." })} />)
    expect(screen.getByText("Listo, no grabé nada. Puedes seguir revisando.")).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(8000)
    })

    expect(screen.queryByText("Listo, no grabé nada. Puedes seguir revisando.")).toBeNull()
    expect(replace).toHaveBeenCalledWith("/guion/p1")
  })
})
