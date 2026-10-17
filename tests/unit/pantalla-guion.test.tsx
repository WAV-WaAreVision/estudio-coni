import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { type DatosDeGuion, PantallaGuion } from "@/app/(app)/guion/[id]/pantalla-guion"
import { AYUDA_DE_MARCAS_EN_LECTURA } from "@/components/ayuda-de-marcas"
import type { DatosDeGrabacion } from "@/lib/datos/grabacion"
import type { Hallazgo } from "@/lib/dominio/revision"

const { aprobarGuionAccion, editarGuionAccion, pedirCambiosAccion, pedirVozAccion, replace } = vi.hoisted(() => ({
  aprobarGuionAccion: vi.fn(),
  editarGuionAccion: vi.fn(),
  pedirCambiosAccion: vi.fn(),
  pedirVozAccion: vi.fn(),
  replace: vi.fn(),
}))

// Next hands back the same router on every render, as here.
const ROUTER = { push: vi.fn(), refresh: vi.fn(), replace }
vi.mock("next/navigation", () => ({ useRouter: () => ROUTER }))
vi.mock("@/app/(app)/piezas/acciones", () => ({
  aprobarGuionAccion,
  pedirVozAccion,
  pedirCambiosAccion,
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

const LINEA = "Graba el video · US$ 3,48 · 8 s para deshacer"
const VOZ = { url: "https://almacen.test/voces/p1/t-x-0.mp3", clave: "voces/p1/t-x-0.mp3" }
const BOTONES = {
  montoVoz: "US$ 0,33",
  unidadVoz: "~1.100 caracteres",
  saldoVoz: "ElevenLabs: te quedan 23.400 de 100.000 caracteres.",
  bloqueoVoz: null,
  bloqueoVideo: null,
}
const FRASE: Hallazgo = {
  regla: "cifra_sin_verificar",
  tipo: "advierte",
  mensaje: "Verifica la cifra.",
  frase: "Soy Coni del Rosario.",
}
const BLOQUEA: Hallazgo = { regla: "cierre", tipo: "bloquea", mensaje: "Falta el cierre." }

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

const firma = () => screen.getByRole("slider", { name: "Desliza para firmar" })
const firmar = () => fireEvent.keyDown(firma(), { key: "Enter" })
const barra = () => screen.getByRole("region", { name: "Firma" })
const elegirEstudio = () => fireEvent.click(screen.getByRole("radio", { name: "Estudio" }))
const escuchar = () => fireEvent.click(screen.getByRole("button", { name: "Terminé de escuchar" }))
const editor = () => screen.getByText("Editar el guion", { selector: "summary" }).closest("details") as HTMLElement
/** The slider's description joins the "Falta:" line or block, the consequence and the hint: match one part. */
const contiene = (texto: string) => new RegExp(texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))

beforeEach(() => {
  aprobarGuionAccion.mockReset().mockResolvedValue({ ok: true, version: 6 })
  editarGuionAccion.mockReset()
  pedirCambiosAccion.mockReset().mockResolvedValue({ ok: true })
  pedirVozAccion.mockReset().mockResolvedValue({ ok: true })
  replace.mockReset()
  // jsdom does not scroll.
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("PantallaGuion: el orden de v6", () => {
  it("goes back, meta, title, date in ink, 1. the voice, 2. the script, Más opciones and the bar", () => {
    render(<PantallaGuion datos={datos({ salida: "jueves 22 de octubre · 09:00" })} />)
    expect(screen.getByRole("link", { name: "Inicio" })).toHaveAttribute("href", "/")
    const voz = screen.getByRole("heading", { name: "1. Escucha tu voz" })
    const guion = screen.getByRole("heading", { name: "2. Revisa el guion" })
    const mas = screen.getByText("Más opciones")
    expect(voz.compareDocumentPosition(guion) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(guion.compareDocumentPosition(mas) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(mas.compareDocumentPosition(barra()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByText("Si lo firmas hoy, sale el", { exact: false })).toBeInTheDocument()
    expect(screen.getByText("jueves 22 de octubre · 09:00")).toHaveClass("font-semibold", "text-tinta")
    expect(screen.getByText("jueves 22 de octubre · 09:00").className).not.toMatch(/firma/)
  })

  it("shows the script in a reading panel, marks a finding's phrase and links it to its panel", () => {
    render(<PantallaGuion datos={datos({ revision: [FRASE] })} />)
    expect(screen.getByRole("link", { name: "Soy Coni del Rosario." })).toHaveAttribute("href", "#revision-0")
    expect(screen.getByRole("region", { name: "Revisa la frase marcada" })).toHaveAttribute("id", "revision-0")
    expect(screen.getByText("1 frase marcada")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("checkbox", { name: "Lo revisé y está bien" }))
    expect(screen.getByText("Revisado")).toBeInTheDocument()
    expect(screen.getByText("Frase revisada")).toBeInTheDocument()
  })

  it("reads the tone marks as Spanish chips, with a help about the grey labels instead of the brackets", () => {
    render(<PantallaGuion datos={datos({ guion: "[warm] Hola, soy Coni. [pause] Soy Coni del Rosario." })} />)
    const lectura = screen.getByRole("region", { name: "2. Revisa el guion" })
    expect(within(lectura).getByText("cálido")).toBeInTheDocument()
    expect(within(lectura).getByText("pausa")).toBeInTheDocument()
    expect(within(lectura).getByText(AYUDA_DE_MARCAS_EN_LECTURA)).toBeInTheDocument()
    // Only the folded editor, which keeps the raw marks, talks about brackets.
    for (const ayuda of within(lectura).queryAllByText(/corchetes/)) expect(editor()).toContainElement(ayuda)
  })

  it("says Claude found nothing when the review is empty", () => {
    render(<PantallaGuion datos={datos()} />)
    expect(screen.getByText("Claude revisó el guion y no encontró observaciones. Tú decides.")).toBeInTheDocument()
  })

  it("folds the editor under 'Editar el guion', with the new take and 'Pedir cambios' inside", () => {
    render(<PantallaGuion datos={datos()} />)
    expect(editor()).not.toHaveAttribute("open")
    expect(within(editor()).getByRole("textbox", { name: "Guion" })).toBeInTheDocument()
    expect(within(editor()).getByRole("button", { name: /^Grabar la voz de nuevo/ })).toBeInTheDocument()
    expect(within(editor()).getByText("Escribo un guion nuevo y este se descarta.")).toBeInTheDocument()
  })

  it("opens the editor by itself when a finding blocks, and the block's 'Editar el guion' opens it too", () => {
    const { unmount } = render(<PantallaGuion datos={datos({ revision: [BLOQUEA] })} />)
    expect(editor()).toHaveAttribute("open")
    unmount()

    render(<PantallaGuion datos={datos({ revision: [BLOQUEA] })} />)
    fireEvent.click(screen.getByText("Editar el guion", { selector: "summary" }))
    expect(editor()).not.toHaveAttribute("open")
    fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Editar el guion" }))
    expect(editor()).toHaveAttribute("open")
  })

  it("asks before asking for changes, with today's question", async () => {
    render(<PantallaGuion datos={datos()} />)
    fireEvent.click(within(editor()).getByRole("button", { name: "Pedir cambios" }))
    expect(screen.getByText("Se escribe un guion nuevo y este se descarta. ¿Seguro?")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Sí, pedir cambios" }))
    await waitFor(() => expect(pedirCambiosAccion).toHaveBeenCalledWith("p1", 5))
  })

  it("folds the looks under 'Más opciones', open while none is chosen, and names the chosen one", () => {
    render(<PantallaGuion datos={datos()} />)
    const mas = screen.getByText("Más opciones").closest("details")
    expect(mas).toHaveAttribute("open")
    expect(screen.getByText("Avatar: falta elegirlo")).toBeInTheDocument()
    elegirEstudio()
    expect(screen.getByText("Avatar: Estudio")).toBeInTheDocument()
  })

  it("starts 'Más opciones' folded when the look she signed with is still offered", () => {
    render(<PantallaGuion datos={datos({ avatarGuardado: "look-a" })} />)
    expect(screen.getByText("Más opciones").closest("details")).not.toHaveAttribute("open")
    expect(screen.getByText("Avatar: Estudio")).toBeInTheDocument()
    expect(screen.getByRole("radio", { name: "Estudio" })).toBeChecked()
  })

  it("leaves 'Más opciones' out when there are no looks and no LinkedIn text: the bar's block is the only message", () => {
    render(<PantallaGuion datos={datos({ avatares: [] })} />)
    expect(screen.queryByText("Más opciones")).toBeNull()
    expect(screen.queryByText(/^Avatar:/)).toBeNull()
  })

  it("starts 'Más opciones' folded, with no avatar line, when there are no looks but there is a LinkedIn text", () => {
    render(<PantallaGuion datos={datos({ avatares: [], textoLinkedin: "Un texto para LinkedIn." })} />)
    expect(screen.getByText("Más opciones").closest("details")).not.toHaveAttribute("open")
    expect(screen.queryByText(/^Avatar:/)).toBeNull()
    expect(screen.getByText("Un texto para LinkedIn.")).toBeInTheDocument()
  })

  it("shows a phrase HeyGen refused as a warning block when her voice is there", () => {
    render(<PantallaGuion datos={datos({ explicacion: "HeyGen marcó una frase como sensible." })} />)
    expect(screen.getByText("HeyGen marcó una frase como sensible.").closest("output")).toHaveClass("bg-piedra-honda")
  })
})

describe("PantallaGuion: la firma", () => {
  it("lists everything missing after 'Falta:' and signs once nothing is", async () => {
    render(<PantallaGuion datos={datos()} />)
    expect(within(barra()).getByText("escuchar tu voz · elegir el avatar", { exact: false })).toBeInTheDocument()
    expect(firma()).toHaveAttribute("aria-disabled", "true")
    expect(firma()).toHaveAccessibleDescription(contiene("escuchar tu voz · elegir el avatar"))

    elegirEstudio()
    escuchar()
    expect(within(barra()).queryByText("Falta:")).toBeNull()
    expect(firma()).toHaveAttribute("aria-disabled", "false")
    firmar()
    await waitFor(() => expect(aprobarGuionAccion).toHaveBeenCalledWith("p1", 5, "look-a"))
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/guion/p1?firmada=6"))
  })

  it("asks her to listen again when another take of her voice arrives", () => {
    const { rerender } = render(<PantallaGuion datos={datos()} />)
    elegirEstudio()
    escuchar()
    expect(firma()).toHaveAttribute("aria-disabled", "false")
    const otra = { url: "https://almacen.test/voces/p1/t-x-1.mp3", clave: "voces/p1/t-x-1.mp3" }
    rerender(<PantallaGuion datos={datos({}, { voz: otra })} />)
    expect(within(barra()).getByText("escuchar tu voz", { exact: false })).toBeInTheDocument()
    expect(firma()).toHaveAttribute("aria-disabled", "true")
  })

  it("says HeyGen's balance as a block in the bar, with no list, even before her voice", () => {
    const bloqueo = "Tu saldo de API de HeyGen no alcanza (te quedan US$ 0,00 y este video cuesta unos US$ 3,48)."
    render(<PantallaGuion datos={datos({}, { voz: null, botones: { ...BOTONES, bloqueoVideo: bloqueo } })} />)
    expect(within(barra()).getByRole("status")).toHaveTextContent(bloqueo)
    expect(within(barra()).queryByText("Falta:")).toBeNull()
    expect(firma()).toHaveAttribute("aria-disabled", "true")
    expect(firma()).toHaveAccessibleDescription(contiene(bloqueo))
  })

  it("blocks in the bar with today's text when there are no looks to choose", () => {
    render(<PantallaGuion datos={datos({ avatares: [] })} />)
    expect(within(barra()).getByText("Todavía no hay avatares para elegir: avísale a Federico.")).toBeInTheDocument()
    expect(screen.queryByRole("radio")).toBeNull()
  })

  it("says what the signature does under the track, and describes the track with it", () => {
    render(<PantallaGuion datos={datos()} />)
    expect(within(barra()).getByText(LINEA)).toHaveClass("text-center")
    expect(firma()).toHaveAccessibleDescription(contiene(LINEA))
  })

  it("asks to save an edit first, and closes the new take until then", () => {
    render(<PantallaGuion datos={datos()} />)
    fireEvent.change(within(editor()).getByRole("textbox", { name: "Guion" }), { target: { value: "Hola, soy Coni." } })
    expect(within(barra()).getByText("guardar tus cambios", { exact: false })).toBeInTheDocument()
    const otraVez = within(editor()).getByRole("button", { name: /^Grabar la voz de nuevo/ })
    expect(otraVez).toHaveAttribute("aria-disabled", "true")
    expect(otraVez).toHaveAccessibleDescription("Guarda tus cambios antes de grabar tu voz.")
  })

  it("while her voice is being made keeps the script readable and the editor down to the closed 'Pedir cambios'", () => {
    render(<PantallaGuion datos={datos({}, { estado: "grabando_voz" })} />)
    expect(screen.queryByRole("textbox", { name: "Guion" })).toBeNull()
    expect(screen.getByText("Hola, soy Coni. Soy Coni del Rosario.")).toBeInTheDocument()
    const pedir = within(editor()).getByRole("button", { name: "Pedir cambios" })
    expect(pedir).toHaveAttribute("aria-disabled", "true")
    expect(pedir).toHaveAccessibleDescription("Puedes pedir cambios cuando tu voz esté lista.")
    expect(within(editor()).getByText("Video hecho con mi avatar digital.")).toBeInTheDocument()
    expect(within(barra()).getByText("que termine tu voz", { exact: false })).toBeInTheDocument()
  })

  it("after an edit, asks for her voice and signs on the version the server returned", async () => {
    editarGuionAccion.mockResolvedValue({ ok: true, version: 7, revision: [] })
    render(<PantallaGuion datos={datos()} />)
    fireEvent.change(within(editor()).getByRole("textbox", { name: "Texto de la publicación" }), {
      target: { value: "Video hecho con mi avatar digital. Cuéntame qué te pasa." },
    })
    fireEvent.click(within(editor()).getByRole("button", { name: "Guardar cambios" }))
    await screen.findByText("Guardado")

    fireEvent.click(within(editor()).getByRole("button", { name: /^Grabar la voz de nuevo/ }))
    await waitFor(() => expect(pedirVozAccion).toHaveBeenCalledWith("p1", 7, true))
    elegirEstudio()
    escuchar()
    firmar()
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

  it("follows the version the server sends, so a request after a refused one is not stale", async () => {
    const { rerender } = render(<PantallaGuion datos={datos()} />)
    rerender(<PantallaGuion datos={datos({ version: 7 })} />)
    fireEvent.click(within(editor()).getByRole("button", { name: /^Grabar la voz de nuevo/ }))
    await waitFor(() => expect(pedirVozAccion).toHaveBeenCalledWith("p1", 7, true))
  })

  it("opens with the toast it was given at the top, and takes it out of the address when it closes", () => {
    vi.useFakeTimers()
    render(<PantallaGuion datos={datos({ avisoInicial: "Listo, no grabé nada. Puedes seguir revisando." })} />)
    expect(screen.getByText("Listo, no grabé nada. Puedes seguir revisando.").closest("output")).toHaveAttribute(
      "data-lugar",
      "arriba",
    )
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
    fireEvent.change(within(editor()).getByRole("textbox", { name: "Guion" }), { target: { value: "Otro texto." } })
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(screen.queryByText("Listo, no grabé nada. Puedes seguir revisando.")).toBeNull()
  })
})
