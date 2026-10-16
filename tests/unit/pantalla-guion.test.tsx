import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { type DatosDeGuion, PantallaGuion } from "@/app/(app)/guion/[id]/pantalla-guion"
import type { DatosDeGrabacion } from "@/lib/datos/grabacion"
import type { Hallazgo } from "@/lib/dominio/revision"

const { aprobarGuionAccion, editarGuionAccion, pedirVozAccion, replace } = vi.hoisted(() => ({
  aprobarGuionAccion: vi.fn(),
  editarGuionAccion: vi.fn(),
  pedirVozAccion: vi.fn(),
  replace: vi.fn(),
}))

// Next hands back the same router on every render, as here.
const ROUTER = { push: vi.fn(), refresh: vi.fn(), replace }
vi.mock("next/navigation", () => ({ useRouter: () => ROUTER }))
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
    avatarGuardado: null,
    grabacion: { estado: "guion_por_aprobar", voz: VOZ, botones: BOTONES, lineaDeFirma: LINEA, ...grabacion },
    ...sobre,
  }
}

const aprobar = () => screen.getByRole("slider", { name: "Desliza para firmar" })
const elegirEstudio = () => fireEvent.click(screen.getByRole("radio", { name: "Estudio" }))
const escuchar = () => fireEvent.click(screen.getByRole("button", { name: "Terminé de escuchar" }))
/** The slider's description joins the reason, the consequence and the hint: match the part a test is about. */
const contiene = (texto: string) => new RegExp(texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))

beforeEach(() => {
  aprobarGuionAccion.mockReset().mockResolvedValue({ ok: true, version: 6 })
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
    fireEvent.keyDown(aprobar(), { key: "Enter" })
    await waitFor(() => expect(aprobarGuionAccion).toHaveBeenCalledWith("p1", 5, "look-a"))
  })

  it("carries the version she signed at to the video screen, for its undo", async () => {
    aprobarGuionAccion.mockResolvedValue({ ok: true, version: 6 })
    render(<PantallaGuion datos={datos()} />)
    elegirEstudio()
    escuchar()

    fireEvent.keyDown(aprobar(), { key: "Enter" })

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/guion/p1?firmada=6"))
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

  it("says the HeyGen block before the missing voice, so she pays no voice for a video that cannot be paid", () => {
    const bloqueo = "Tu saldo de API de HeyGen no alcanza (te quedan US$ 0,00 y este video cuesta unos US$ 3,48)."
    render(<PantallaGuion datos={datos({}, { voz: null, botones: { ...BOTONES, bloqueoVideo: bloqueo } })} />)

    expect(aprobar()).toHaveAccessibleDescription(contiene(bloqueo))
  })

  it("asks to save the edit before any reason about her voice", () => {
    render(<PantallaGuion datos={datos({}, { voz: null })} />)
    fireEvent.change(screen.getByRole("textbox", { name: "Guion" }), { target: { value: "Hola, soy Coni." } })

    expect(aprobar()).toHaveAccessibleDescription(contiene("Guarda tus cambios antes de aprobar"))
  })

  it("says what the signature spends and how long she has to undo it, under the slider", () => {
    render(<PantallaGuion datos={datos()} />)
    const barra = screen.getByRole("region", { name: "Firma" })
    expect(within(barra).getByRole("slider", { name: "Desliza para firmar" })).toBeInTheDocument()
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

  it("while her voice is being made, keeps Pedir cambios closed and says why", () => {
    render(<PantallaGuion datos={datos({}, { estado: "grabando_voz" })} />)
    const pedir = screen.getByRole("button", { name: "Pedir cambios" })

    expect(pedir).toHaveAttribute("aria-disabled", "true")
    expect(pedir).toHaveAccessibleDescription("Puedes pedir cambios cuando tu voz esté lista.")
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
    fireEvent.keyDown(aprobar(), { key: "Enter" })
    await waitFor(() => expect(aprobarGuionAccion).toHaveBeenCalledWith("p1", 7, "look-a"))
  })

  it("keeps her avatar and her review ticks across the round trip of her voice", () => {
    const aviso: Hallazgo = { regla: "cifra_sin_verificar", tipo: "advierte", mensaje: "Verifica la cifra." }
    const enRevision = datos({ revision: [aviso] })
    const { rerender } = render(<PantallaGuion datos={enRevision} />)
    elegirEstudio()
    fireEvent.click(screen.getByRole("checkbox", { name: "Lo revisé y está bien" }))

    rerender(
      <PantallaGuion datos={{ ...enRevision, grabacion: { ...enRevision.grabacion, estado: "grabando_voz" } }} />,
    )
    rerender(<PantallaGuion datos={enRevision} />)

    expect(screen.getByRole("radio", { name: "Estudio" })).toBeChecked()
    expect(screen.getByRole("checkbox", { name: "Lo revisé y está bien" })).toBeChecked()
  })

  it("opens with the avatar she signed with chosen, when it is still one to choose", () => {
    const { unmount } = render(<PantallaGuion datos={datos({ avatarGuardado: "look-a" })} />)
    expect(screen.getByRole("radio", { name: "Estudio" })).toBeChecked()
    unmount()

    render(<PantallaGuion datos={datos({ avatarGuardado: "look-retirado" })} />)
    expect(screen.getByRole("radio", { name: "Estudio" })).not.toBeChecked()
  })

  it("follows the version the server sends, so a request after a refused one is not stale", async () => {
    const { rerender } = render(<PantallaGuion datos={datos()} />)
    rerender(<PantallaGuion datos={datos({ version: 7 })} />)

    fireEvent.click(screen.getByRole("button", { name: "Grabar la voz de nuevo" }))
    await waitFor(() => expect(pedirVozAccion).toHaveBeenCalledWith("p1", 7, true))
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

  it("keeps the toast's 8 s while she types: a re-render does not restart its timer", () => {
    vi.useFakeTimers()
    render(<PantallaGuion datos={datos({ avisoInicial: "Listo, no grabé nada. Puedes seguir revisando." })} />)

    act(() => {
      vi.advanceTimersByTime(5000)
    })
    fireEvent.change(screen.getByRole("textbox", { name: "Guion" }), { target: { value: "Otro texto." } })
    act(() => {
      vi.advanceTimersByTime(3000)
    })

    expect(screen.queryByText("Listo, no grabé nada. Puedes seguir revisando.")).toBeNull()
  })
})
