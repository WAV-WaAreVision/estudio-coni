import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { type DatosDeVideo, PantallaVideo } from "@/app/(app)/video/[id]/pantalla-video"
import { AVISO_AVATAR, AVISO_AVATAR_LINKEDIN, type Hallazgo } from "@/lib/dominio/revision"

const { aprobarVideoAccion, editarTextoLinkedinAccion } = vi.hoisted(() => ({
  aprobarVideoAccion: vi.fn(),
  editarTextoLinkedinAccion: vi.fn(),
}))

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@/app/(app)/piezas/acciones", () => ({
  aprobarVideoAccion,
  editarTextoLinkedinAccion,
  editarTextoAccion: vi.fn(),
  regrabarAccion: vi.fn(),
}))
vi.mock("@/app/(app)/ajustes/acciones", () => ({ marcarAvatarVistoAccion: vi.fn() }))
// The player is a real <video>: here it only says it was watched to the end.
vi.mock("@/components/reproductor-video", () => ({
  ReproductorVideo: ({ alVerCompleto }: { alVerCompleto: () => void }) => (
    <button type="button" onClick={alVerCompleto}>
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
    revision: [],
    videoUrl: null,
    videoId: "videos/e2e.webm",
    fechas: [{ iso: "2099-10-09T22:00:00.000Z", etiqueta: "viernes 9 de octubre · 19:00" }],
    costoDeRegrabar: null,
    explicacion: null,
    primeraVez: false,
    ...sobre,
  }
}

function abrir(sobre: Partial<DatosDeVideo> = {}) {
  render(<PantallaVideo datos={datos(sobre)} />)
  fireEvent.click(screen.getByRole("button", { name: "Terminé de ver" }))
}

const deslizador = () => screen.getByRole("slider", { name: "Desliza para aprobar video y fecha" })
const revisar = () => fireEvent.click(screen.getByRole("checkbox", { name: /Revisé labios/ }))
const destino = (nombre: string) => screen.getByRole("checkbox", { name: nombre })

beforeEach(() => {
  aprobarVideoAccion.mockReset().mockResolvedValue({ ok: true })
  editarTextoLinkedinAccion.mockReset().mockResolvedValue({ ok: true })
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

describe("PantallaVideo: dónde se publica", () => {
  it("starts with the destinations Ajustes chose and shows no LinkedIn text while LinkedIn is not chosen", () => {
    abrir()
    expect(destino("Instagram")).toBeChecked()
    expect(destino("LinkedIn")).not.toBeChecked()
    expect(screen.queryByRole("heading", { name: "Texto para LinkedIn" })).not.toBeInTheDocument()
  })

  it("starts with both when Ajustes says so, and shows the LinkedIn text she will publish", () => {
    abrir({ destinosPorDefecto: ["instagram", "linkedin"] })
    expect(destino("LinkedIn")).toBeChecked()
    const seccion = screen.getByRole("heading", { name: "Texto para LinkedIn" }).closest("section")
    expect(seccion).not.toBeNull()
    expect(within(seccion as HTMLElement).getByText(/Llevan diez años juntos/)).toBeInTheDocument()
  })

  it("shows the LinkedIn text when she ticks LinkedIn and hides it when she unticks it", () => {
    abrir()
    fireEvent.click(destino("LinkedIn"))
    expect(screen.getByRole("heading", { name: "Texto para LinkedIn" })).toBeInTheDocument()
    fireEvent.click(destino("LinkedIn"))
    expect(screen.queryByRole("heading", { name: "Texto para LinkedIn" })).not.toBeInTheDocument()
  })

  it("keeps the findings of the LinkedIn text out of the review of the caption and under its own text", () => {
    abrir({ destinosPorDefecto: ["instagram", "linkedin"], revision: [ADVIERTE_TEXTO, ADVIERTE_LINKEDIN] })
    const revision = screen.getByRole("heading", { name: "Revisión" }).closest("section") as HTMLElement
    expect(within(revision).getByText("Escribe los números con palabras.")).toBeInTheDocument()
    expect(within(revision).queryByText("Demasiados hashtags en LinkedIn.")).not.toBeInTheDocument()
    const linkedin = screen.getByRole("heading", { name: "Texto para LinkedIn" }).closest("section") as HTMLElement
    expect(within(linkedin).getByText("Demasiados hashtags en LinkedIn.")).toBeInTheDocument()
  })

  it("does not show the findings of the LinkedIn text when LinkedIn is not chosen", () => {
    abrir({ revision: [BLOQUEA_LINKEDIN] })
    expect(screen.queryByText("Falta el aviso de LinkedIn.")).not.toBeInTheDocument()
  })
})

describe("PantallaVideo: lo que bloquea", () => {
  it("lets her approve for Instagram when only the LinkedIn text blocks", () => {
    abrir({ revision: [BLOQUEA_LINKEDIN] })
    revisar()
    expect(deslizador()).toHaveAttribute("aria-disabled", "false")
  })

  it("blocks the approval when LinkedIn is chosen and its text blocks, and says there is something to fix", () => {
    abrir({ revision: [BLOQUEA_LINKEDIN] })
    revisar()
    fireEvent.click(destino("LinkedIn"))
    expect(deslizador()).toHaveAttribute("aria-disabled", "true")
    expect(screen.getByText("Hay algo que corregir antes de aprobar.")).toBeInTheDocument()
    expect(screen.getByText("Falta el aviso de LinkedIn.")).toBeInTheDocument()
  })

  it("asks her to confirm a LinkedIn warning only when LinkedIn is chosen", () => {
    abrir({ revision: [ADVIERTE_LINKEDIN] })
    revisar()
    expect(deslizador()).toHaveAttribute("aria-disabled", "false")

    fireEvent.click(destino("LinkedIn"))
    expect(deslizador()).toHaveAttribute("aria-disabled", "true")
    expect(screen.getByText("Confirma la revisión.")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("checkbox", { name: "Lo revisé y está bien" }))
    expect(deslizador()).toHaveAttribute("aria-disabled", "false")
  })

  it("still blocks on a finding of the caption, whatever the destinations", () => {
    abrir({
      destinosPorDefecto: ["linkedin"],
      revision: [{ regla: "aviso_avatar", tipo: "bloquea", mensaje: "Falta el aviso de Instagram." }],
    })
    revisar()
    expect(deslizador()).toHaveAttribute("aria-disabled", "true")
  })
})

describe("PantallaVideo: una pieza de antes de LinkedIn", () => {
  it("starts the LinkedIn text from the caption without hashtags and with the LinkedIn notice, and asks to save it", () => {
    abrir({ textoLinkedin: null, destinosPorDefecto: ["instagram", "linkedin"] })
    revisar()
    expect(screen.getByLabelText("Texto de la publicación en LinkedIn")).toHaveValue(
      `Hablemos de límites\n\n${AVISO_AVATAR_LINKEDIN}`,
    )
    expect(deslizador()).toHaveAttribute("aria-disabled", "true")
    expect(screen.getByText("Guarda el texto para LinkedIn.")).toBeInTheDocument()
  })

  it("lets her approve for Instagram without saving a LinkedIn text", () => {
    abrir({ textoLinkedin: null })
    revisar()
    expect(deslizador()).toHaveAttribute("aria-disabled", "false")
  })

  it("saves the starting text through the action of this piece", async () => {
    abrir({ textoLinkedin: null, destinosPorDefecto: ["instagram", "linkedin"] })

    fireEvent.click(screen.getByRole("button", { name: "Guardar el texto para LinkedIn" }))

    await waitFor(() =>
      expect(editarTextoLinkedinAccion).toHaveBeenCalledWith(
        "p1",
        5,
        `Hablemos de límites\n\n${AVISO_AVATAR_LINKEDIN}`,
      ),
    )
  })
})

describe("PantallaVideo: aprobar", () => {
  function deslizarHastaElFinal() {
    fireEvent.pointerDown(deslizador(), { pointerId: 1, clientX: 0 })
    fireEvent.pointerMove(deslizador(), { pointerId: 1, clientX: 300 })
    fireEvent.pointerUp(deslizador(), { pointerId: 1, clientX: 300 })
  }

  it("sends the destinations she chose with the piece, its version and the date", async () => {
    abrir({ destinosPorDefecto: ["instagram", "linkedin"] })
    revisar()

    deslizarHastaElFinal()

    await waitFor(() =>
      expect(aprobarVideoAccion).toHaveBeenCalledWith("p1", 5, "2099-10-09T22:00:00.000Z", ["instagram", "linkedin"]),
    )
  })

  it("sends only the destinations that are ticked when she unticks one", async () => {
    abrir({ destinosPorDefecto: ["instagram", "linkedin"] })
    fireEvent.click(destino("Instagram"))
    revisar()

    deslizarHastaElFinal()

    await waitFor(() =>
      expect(aprobarVideoAccion).toHaveBeenCalledWith("p1", 5, "2099-10-09T22:00:00.000Z", ["linkedin"]),
    )
  })
})

describe("PantallaVideo: ediciones sin guardar", () => {
  const MOTIVO = "Guarda o cancela la edición del texto."

  it("blocks the approval while the LinkedIn text is being edited, and frees it when she cancels", () => {
    abrir({ destinosPorDefecto: ["instagram", "linkedin"] })
    revisar()
    expect(deslizador()).toHaveAttribute("aria-disabled", "false")

    fireEvent.click(screen.getByRole("button", { name: "Editar el texto para LinkedIn" }))
    expect(deslizador()).toHaveAttribute("aria-disabled", "true")
    expect(screen.getByText(MOTIVO)).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }))
    expect(deslizador()).toHaveAttribute("aria-disabled", "false")
  })

  it("blocks the approval while the caption is being edited", () => {
    abrir()
    revisar()

    fireEvent.click(screen.getByRole("button", { name: "Editar el texto" }))

    expect(deslizador()).toHaveAttribute("aria-disabled", "true")
    expect(screen.getByText(MOTIVO)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }))
    expect(deslizador()).toHaveAttribute("aria-disabled", "false")
  })

  it("does not wait for an editor of LinkedIn that is not on screen", () => {
    abrir()
    revisar()
    expect(deslizador()).toHaveAttribute("aria-disabled", "false")
  })
})
