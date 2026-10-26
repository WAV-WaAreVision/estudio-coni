import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { type DatosDeVideo, PantallaVideo } from "@/app/(app)/video/[id]/pantalla-video"
import { AVISO_AVATAR, AVISO_AVATAR_LINKEDIN, type Hallazgo } from "@/lib/dominio/revision"

/** The consequence line under the track: its parts are separate spans, so it is matched by its whole text. */
const consecuencia = (texto: string) => (_: string, nodo: Element | null) =>
  nodo?.tagName === "P" && nodo.textContent === texto

const { aprobarVideoAccion, editarTextoLinkedinAccion, regrabarAccion } = vi.hoisted(() => ({
  aprobarVideoAccion: vi.fn(),
  editarTextoLinkedinAccion: vi.fn(),
  regrabarAccion: vi.fn(),
}))

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@/app/(app)/piezas/acciones", () => ({
  aprobarVideoAccion,
  editarTextoLinkedinAccion,
  editarTextoAccion: vi.fn(),
  regrabarAccion,
}))
vi.mock("@/app/(app)/ajustes/acciones", () => ({ marcarAvatarVistoAccion: vi.fn() }))
// The player is a real <video>: here it only says it was watched to the end.
vi.mock("@/components/reproductor-video", () => ({
  ReproductorVideo: ({ alVerCompleto, zonas }: { alVerCompleto: () => void; zonas: boolean }) => (
    <button type="button" onClick={alVerCompleto} data-zonas={String(zonas)}>
      Terminé de ver
    </button>
  ),
}))

const CAPTION = `Hablemos de límites #limites #pareja\n\n${AVISO_AVATAR}`
const LINKEDIN = `Llevan diez años juntos.\n\n¿En qué momento te cuesta desconectarte?\n\n${AVISO_AVATAR_LINKEDIN}`
const BLOQUEA_LINKEDIN: Hallazgo = {
  regla: "aviso_avatar",
  tipo: "bloquea",
  mensaje: "Falta el aviso de LinkedIn.",
  campo: "linkedin",
}
const ADVIERTE_LINKEDIN: Hallazgo = {
  regla: "hashtags_linkedin",
  tipo: "advierte",
  mensaje: "Demasiados hashtags en LinkedIn.",
  campo: "linkedin",
}
const BLOQUEA_TEXTO: Hallazgo = { regla: "aviso_avatar", tipo: "bloquea", mensaje: "Falta el aviso del avatar." }
const ADVIERTE_TEXTO: Hallazgo = { regla: "numeros", tipo: "advierte", mensaje: "Escribe los números con palabras." }

function datos(sobre: Partial<DatosDeVideo> = {}): DatosDeVideo {
  return {
    id: "p1",
    version: 5,
    titulo: "Ser tu propia diosa",
    pilar: null,
    segundos: 40,
    texto: CAPTION,
    textoLinkedin: LINKEDIN,
    destinosPorDefecto: ["instagram"],
    instagramConectado: false,
    linkedinConectado: false,
    revision: [],
    videoUrl: null,
    videoId: "videos/e2e.webm",
    fechas: [
      { iso: "2099-10-09T22:00:00.000Z", etiqueta: "viernes 9 de octubre · 19:00", corta: "viernes 9 · 19:00" },
      { iso: "2099-10-12T22:00:00.000Z", etiqueta: "lunes 12 de octubre · 19:00", corta: "lunes 12 · 19:00" },
    ],
    costoDeRegrabar: "US$ 3,48",
    explicacion: null,
    primeraVez: false,
    ...sobre,
  }
}

const ver = () => fireEvent.click(screen.getByRole("button", { name: "Terminé de ver" }))
function abrir(sobre: Partial<DatosDeVideo> = {}) {
  render(<PantallaVideo datos={datos(sobre)} />)
  ver()
}
const firma = () => screen.getByRole("slider", { name: "Desliza para firmar" })
const barra = () => screen.getByRole("region", { name: "Firma" })
const revisar = () => fireEvent.click(screen.getByRole("checkbox", { name: /Revisé labios/ }))
const destino = (nombre: string) => screen.getByRole("checkbox", { name: nombre })

beforeEach(() => {
  aprobarVideoAccion.mockReset().mockResolvedValue({ ok: true })
  editarTextoLinkedinAccion.mockReset().mockResolvedValue({ ok: true })
  regrabarAccion.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("PantallaVideo: todo a la vista antes de terminar", () => {
  it("names the pillar by its short name in the gate header", () => {
    abrir({ pilar: { slug: "caso-coni", nombre: "Caso Coni: humana + avatar", nombreCorto: "Caso Coni" } })
    expect(screen.getByText("Caso Coni")).toBeInTheDocument()
    expect(screen.queryByText("Caso Coni: humana + avatar")).toBeNull()
  })

  it("shows the checkbox, the texts and the date before the video ends, and waits for the full watch to sign", () => {
    render(<PantallaVideo datos={datos()} />)
    expect(screen.getByRole("checkbox", { name: /Revisé labios/ })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Así sale en Instagram" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Dónde y cuándo" })).toBeInTheDocument()
    expect(screen.queryByText("Lo viste completo")).toBeNull()
    expect(
      within(barra()).getByText("terminar el video · marcar lo que revisaste", { exact: false }),
    ).toBeInTheDocument()
    expect(firma()).toHaveAttribute("aria-disabled", "true")

    revisar()
    expect(firma()).toHaveAttribute("aria-disabled", "true")
    ver()
    expect(screen.getByText("Lo viste completo")).toBeInTheDocument()
    expect(firma()).toHaveAttribute("aria-disabled", "false")
  })

  it("says what is done and when it goes out once nothing is missing", () => {
    abrir()
    revisar()
    expect(within(barra()).getByText("Video visto")).toBeInTheDocument()
    expect(within(barra()).getByText("Texto")).toBeInTheDocument()
    expect(within(barra()).getByText(consecuencia("Sale el viernes 9 · 19:00"))).toBeInTheDocument()
    // The date moves with the run's clock: the visual baselines mask it.
    expect(within(barra()).getByText(consecuencia("Sale el viernes 9 · 19:00"))).toHaveAttribute(
      "data-snapshot",
      "varia",
    )
  })

  it("blocks with today's text when there is no free slot", () => {
    abrir({ fechas: [] })
    revisar()
    expect(within(barra()).getByRole("status")).toHaveTextContent("No hay un horario libre. Avísale a Federico.")
    expect(firma()).toHaveAttribute("aria-disabled", "true")
  })
})

describe("PantallaVideo: dónde y cuándo", () => {
  it("states the date in 600 with the destinations and the zone, and changes it from Cambiar", () => {
    abrir()
    expect(screen.getByText("viernes 9 de octubre · 19:00")).toHaveClass("font-semibold")
    expect(screen.getByText("Instagram · hora de Chile")).toBeInTheDocument()
    const cambiar = screen.getByRole("button", { name: "Cambiar" })
    expect(cambiar).toHaveAttribute("aria-expanded", "false")
    fireEvent.click(cambiar)
    fireEvent.click(screen.getByRole("radio", { name: "lunes 12 de octubre · 19:00" }))
    fireEvent.click(screen.getByRole("button", { name: "Listo" }))
    revisar()
    expect(within(barra()).getByText(consecuencia("Sale el lunes 12 · 19:00"))).toBeInTheDocument()
  })

  it("keeps the destinations folded under Más opciones, and names them under the date", () => {
    abrir()
    const mas = screen.getByText("Más opciones").closest("details") as HTMLElement
    expect(mas).not.toHaveAttribute("open")
    expect(within(mas).getByText("LinkedIn, regrabar video")).toBeInTheDocument()
    fireEvent.click(within(mas).getByRole("checkbox", { name: "LinkedIn" }))
    expect(screen.getByText("Instagram y LinkedIn · hora de Chile")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Así sale en LinkedIn" })).toBeInTheDocument()
  })

  it("starts with both destinations when Ajustes says so, and shows the LinkedIn text she will publish", () => {
    abrir({ destinosPorDefecto: ["instagram", "linkedin"] })
    expect(destino("LinkedIn")).toBeChecked()
    const seccion = screen.getByRole("heading", { name: "Así sale en LinkedIn" }).closest("section") as HTMLElement
    expect(within(seccion).getByText(/Llevan diez años juntos/)).toBeInTheDocument()
  })

  it("leads with the LinkedIn text as it will be published and folds the Instagram caption when both go out", () => {
    abrir({ destinosPorDefecto: ["instagram", "linkedin"] })
    const linkedin = screen.getByRole("heading", { name: "Así sale en LinkedIn" })
    expect(linkedin.closest("details")).toBeNull()
    const instagram = screen.getByText("Así sale en Instagram").closest("details") as HTMLElement
    expect(instagram).not.toHaveAttribute("open")
    expect(linkedin.compareDocumentPosition(instagram) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(instagram).getByText(/Hablemos de límites/)).toBeInTheDocument()
    expect(within(instagram).getByRole("button", { name: "Editar el texto" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Editar el texto para LinkedIn" })).toBeInTheDocument()
  })

  it("says a provider's explanation in her words and folds it for WAV", () => {
    abrir({ explicacion: "Los subtítulos de HeyGen no calzan con el guion." })
    const bloque = screen.getByText("Algo no salió como esperaba con esta pieza.").closest("output") as HTMLElement
    const detalle = within(bloque).getByText("Detalle para WAV").closest("details") as HTMLElement
    expect(detalle).toContainElement(screen.getByText("Los subtítulos de HeyGen no calzan con el guion."))
  })

  it("keeps an explanation written for her as it is", () => {
    abrir({ explicacion: "Pasó la hora aprobada. Elige otra fecha." })
    expect(screen.getByText("Pasó la hora aprobada. Elige otra fecha.")).toBeInTheDocument()
    expect(screen.queryByText("Detalle para WAV")).toBeNull()
  })

  it("keeps the Instagram caption as an open section when Instagram goes out alone", () => {
    abrir()
    const instagram = screen.getByRole("heading", { name: "Así sale en Instagram" })
    expect(instagram.closest("details")).toBeNull()
    expect(screen.queryByRole("heading", { name: "Así sale en LinkedIn" })).toBeNull()
  })

  it("keeps the LinkedIn findings under the LinkedIn text and out of the review of the caption", () => {
    abrir({ destinosPorDefecto: ["instagram", "linkedin"], revision: [ADVIERTE_TEXTO, ADVIERTE_LINKEDIN] })
    const revision = screen.getByRole("heading", { name: "Revisión" }).closest("section") as HTMLElement
    expect(within(revision).getByText("Escribe los números con palabras.")).toBeInTheDocument()
    expect(within(revision).queryByText("Demasiados hashtags en LinkedIn.")).toBeNull()
    const linkedin = screen.getByRole("heading", { name: "Así sale en LinkedIn" }).closest("section") as HTMLElement
    expect(within(linkedin).getByText("Demasiados hashtags en LinkedIn.")).toBeInTheDocument()
  })
})

describe("PantallaVideo: lo que bloquea", () => {
  it("lets her sign for Instagram when only the LinkedIn text blocks", () => {
    abrir({ revision: [BLOQUEA_LINKEDIN] })
    revisar()
    expect(firma()).toHaveAttribute("aria-disabled", "false")
  })

  it("asks to fix the text when LinkedIn is chosen and its text blocks", () => {
    abrir({ revision: [BLOQUEA_LINKEDIN] })
    revisar()
    fireEvent.click(destino("LinkedIn"))
    expect(firma()).toHaveAttribute("aria-disabled", "true")
    expect(within(barra()).getByText("corregir el texto", { exact: false })).toBeInTheDocument()
    expect(screen.getByText("Falta el aviso de LinkedIn.")).toBeInTheDocument()
  })

  it("asks to review a LinkedIn warning only when LinkedIn is chosen", () => {
    abrir({ revision: [ADVIERTE_LINKEDIN] })
    revisar()
    expect(firma()).toHaveAttribute("aria-disabled", "false")
    fireEvent.click(destino("LinkedIn"))
    expect(within(barra()).getByText("revisar 1 aviso", { exact: false })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("checkbox", { name: "Lo revisé y está bien" }))
    expect(firma()).toHaveAttribute("aria-disabled", "false")
  })

  it("keeps the caption editor on screen when LinkedIn is the only destination and the caption blocks", () => {
    abrir({ destinosPorDefecto: ["linkedin"], revision: [BLOQUEA_TEXTO] })
    revisar()
    expect(within(barra()).getByText("corregir el texto", { exact: false })).toBeInTheDocument()
    const revision = screen.getByRole("heading", { name: "Revisión" }).closest("section") as HTMLElement
    fireEvent.click(within(revision).getByRole("button", { name: "Editar el texto" }))
    expect(within(revision).getByRole("textbox", { name: /Texto de la publicación/ })).toHaveValue(CAPTION)
  })

  it("asks to save a LinkedIn text that is only a starting point", () => {
    abrir({ textoLinkedin: null, destinosPorDefecto: ["instagram", "linkedin"] })
    revisar()
    expect(screen.getByLabelText("Texto de la publicación en LinkedIn")).toHaveValue(
      `Hablemos de límites\n\n${AVISO_AVATAR_LINKEDIN}`,
    )
    expect(within(barra()).getByText("guardar el texto para LinkedIn", { exact: false })).toBeInTheDocument()
  })

  it("asks to save or cancel an open editor", () => {
    abrir({ destinosPorDefecto: ["instagram", "linkedin"] })
    revisar()
    fireEvent.click(screen.getByRole("button", { name: "Editar el texto para LinkedIn" }))
    expect(within(barra()).getByText("guardar o cancelar la edición del texto", { exact: false })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }))
    expect(firma()).toHaveAttribute("aria-disabled", "false")
  })
})

describe("PantallaVideo: zonas de Instagram", () => {
  it("takes the zones off the video when she unticks Instagram", () => {
    abrir()
    const reproductor = screen.getByRole("button", { name: "Terminé de ver" })
    fireEvent.click(screen.getByRole("button", { name: "Ver zonas de Instagram" }))
    expect(reproductor).toHaveAttribute("data-zonas", "true")
    fireEvent.click(destino("LinkedIn"))
    fireEvent.click(destino("Instagram"))
    expect(screen.queryByRole("button", { name: /zonas de Instagram/ })).toBeNull()
    expect(reproductor).toHaveAttribute("data-zonas", "false")
  })
})

describe("PantallaVideo: firmar y regrabar", () => {
  it("sends the destinations she chose with the piece, its version and the date", async () => {
    abrir({ destinosPorDefecto: ["instagram", "linkedin"] })
    revisar()
    fireEvent.keyDown(firma(), { key: "Enter" })
    await waitFor(() =>
      expect(aprobarVideoAccion).toHaveBeenCalledWith("p1", 5, "2099-10-09T22:00:00.000Z", ["instagram", "linkedin"]),
    )
  })

  it("re-records from Más opciones with its cost, after today's confirmation, and says it at the top", async () => {
    vi.useFakeTimers()
    regrabarAccion.mockResolvedValue({ ok: true, advertencia: "Regrabo sin tu voz." })
    abrir()
    expect(screen.getByText("Se vuelve a grabar con tu avatar y este video se descarta.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Regrabar video US$ 3,48" }))
    expect(
      screen.getByText(
        "Se vuelve a grabar con tu avatar y este video se descarta. Regrabar cuesta unos US$ 3,48. ¿Seguro?",
      ),
    ).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Sí, regrabar" }))
    })
    expect(screen.getByText("Regrabo sin tu voz.").closest("output")).toHaveAttribute("data-lugar", "arriba")
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    revisar()
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(screen.queryByText("Regrabo sin tu voz.")).toBeNull()
  })
})
