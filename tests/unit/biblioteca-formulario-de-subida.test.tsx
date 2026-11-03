import { fireEvent, render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { crearMaterialAccion, confirmarMaterialAccion, descartarMaterialAccion, crearAutorAccion, subirArchivos } =
  vi.hoisted(() => ({
    crearMaterialAccion: vi.fn(),
    confirmarMaterialAccion: vi.fn(),
    descartarMaterialAccion: vi.fn(),
    crearAutorAccion: vi.fn(),
    subirArchivos: vi.fn(),
  }))
vi.mock("@/app/(app)/biblioteca/acciones", () => ({
  crearMaterialAccion,
  confirmarMaterialAccion,
  descartarMaterialAccion,
  crearAutorAccion,
}))
vi.mock("@/app/(app)/biblioteca/subir/subida-cliente", () => ({ subirArchivos }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }))

import { FormularioDeSubida } from "@/app/(app)/biblioteca/subir/formulario-de-subida"
import { AYUDA_DEL_CAMPO, NO_RECONOZCO } from "@/lib/dominio/biblioteca/subir"
import { AVISO_DE_PODCAST } from "@/lib/dominio/biblioteca/youtube"

Object.assign(URL, { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() })

const CONI = "c1111111-2222-4333-8444-555555555555"
const DANIELA = "d1111111-2222-4333-8444-555555555555"
const AUTORES = [
  { id: CONI, nombre: "Coni del Rosario", credencial: null, tipo: "coni", alias: [] },
  { id: DANIELA, nombre: "Daniela Ruiz", credencial: "investigadora", tipo: "persona", alias: [] },
]

const campo = () => screen.getByLabelText("Pega un enlace o elige un archivo")
const pegar = (texto: string) => fireEvent.change(campo(), { target: { value: texto } })

function elegir(container: HTMLElement, selector: string, archivos: File[]) {
  const input = container.querySelector<HTMLInputElement>(selector)
  if (!input) throw new Error(`No está el campo ${selector}`)
  fireEvent.change(input, { target: { files: archivos } })
}
const elegirArchivos = (container: HTMLElement, archivos: File[]) =>
  elegir(container, 'input[type="file"][multiple]', archivos)

beforeEach(() => vi.clearAllMocks())

describe("FormularioDeSubida: the field and its type", () => {
  it("has one field with its own file button and a hidden native input, and says which files it takes", () => {
    const { container } = render(<FormularioDeSubida autores={AUTORES} />)
    expect(campo()).toHaveAccessibleDescription(AYUDA_DEL_CAMPO)
    expect(screen.getByRole("button", { name: "Elegir archivo" })).toBeInTheDocument()
    expect(container.querySelector('input[type="file"][multiple]')).toHaveAttribute("hidden")
    expect(screen.queryByText(/^Tipo:/)).toBeNull()
  })

  it("detects a YouTube link and asks for the pasted transcript with its steps", () => {
    render(<FormularioDeSubida autores={AUTORES} />)
    pegar("https://youtu.be/abc123")
    expect(screen.getByText("Tipo: Video de YouTube")).toBeInTheDocument()
    expect(screen.getByLabelText("Transcripción del video")).toHaveAccessibleDescription(/Mostrar transcripción/)
  })

  it("asks for the transcript of a YouTube link pasted without its scheme", () => {
    render(<FormularioDeSubida autores={AUTORES} />)
    pegar("youtu.be/abc123")
    expect(screen.getByText("Tipo: Video de YouTube")).toBeInTheDocument()
    expect(screen.getByLabelText("Transcripción del video")).toBeInTheDocument()
  })

  it("warns that a podcast is read from its page only", () => {
    render(<FormularioDeSubida autores={AUTORES} />)
    pegar("https://open.spotify.com/episode/abc")
    expect(screen.getByText("Tipo: Podcast")).toBeInTheDocument()
    expect(screen.getByText(AVISO_DE_PODCAST)).toBeInTheDocument()
    expect(screen.queryByLabelText("Transcripción del video")).toBeNull()
  })

  it("lets her change the type, and a new input goes back to what is detected", () => {
    render(<FormularioDeSubida autores={AUTORES} />)
    pegar("Un texto mío sobre la carga mental")
    expect(screen.getByText("Tipo: Texto")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Cambiar el tipo" }))
    fireEvent.change(screen.getByRole("combobox", { name: "Tipo" }), { target: { value: "documento" } })
    expect(screen.getByRole("combobox", { name: "Tipo" })).toHaveValue("documento")
    pegar("Otro texto")
    expect(screen.getByText("Tipo: Texto")).toBeInTheDocument()
    expect(screen.queryByRole("combobox", { name: "Tipo" })).toBeNull()
  })

  it("shows the name of a picked file and its type, and clears what was pasted", () => {
    const { container } = render(<FormularioDeSubida autores={AUTORES} />)
    pegar("https://ejemplo.cl/nota")
    elegirArchivos(container, [new File(["x"], "Tesis.PDF", { type: "application/pdf" })])
    expect(within(screen.getByRole("list", { name: "Archivos elegidos" })).getByText("Tesis.PDF")).toBeInTheDocument()
    expect(screen.getByText("Tipo: Documento")).toBeInTheDocument()
    expect(campo()).toHaveValue("")
  })

  it("says which files it takes when it does not know a picked file", () => {
    const { container } = render(<FormularioDeSubida autores={AUTORES} />)
    elegirArchivos(container, [new File(["x"], "animacion.gif", { type: "image/gif" })])
    expect(screen.getByText(NO_RECONOZCO)).toBeInTheDocument()
    expect(screen.queryByText(/^Tipo:/)).toBeNull()
  })

  it("lists picked images in order and asks for their reference link", () => {
    const { container } = render(<FormularioDeSubida autores={AUTORES} />)
    elegirArchivos(
      container,
      ["a.jpg", "b.png", "c.heic"].map((nombre) => new File(["x"], nombre)),
    )
    expect(screen.getByText("Tipo: 3 imágenes")).toBeInTheDocument()
    expect(within(screen.getByRole("list", { name: "Imágenes en orden" })).getAllByRole("listitem")).toHaveLength(3)
    expect(screen.getByLabelText("Link de referencia (no se abre)")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Quitar la imagen 1" }))
    expect(screen.getByText("Tipo: 2 imágenes")).toBeInTheDocument()
  })

  it("takes a post's text and an optional video of its own", () => {
    const { container } = render(<FormularioDeSubida autores={AUTORES} />)
    pegar("Hoy quiero hablar del descanso.")
    expect(screen.getByText("Tipo: Texto")).toBeInTheDocument()
    elegir(container, 'input[type="file"][accept=".mp4,.mov"]', [new File(["x"], "clase.mp4", { type: "video/mp4" })])
    expect(screen.getByText("clase.mp4")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Quitar el video" }))
    expect(screen.queryByText("clase.mp4")).toBeNull()
    expect(screen.getByRole("button", { name: "Elegir video" })).toBeInTheDocument()
  })
})

describe("FormularioDeSubida: author, who it is for her and the declaration", () => {
  it("asks who it is for her in her words (4h), with Coni's four labels", () => {
    render(<FormularioDeSubida autores={AUTORES} />)
    const grupo = screen.getByRole("group", { name: "¿Quién es para ti?" })
    expect(
      within(grupo)
        .getAllByRole("radio")
        .map((radio) => radio.getAttribute("value")),
    ).toEqual(["voz_propia", "referente", "evidencia", "estrategia"])
    expect(screen.queryByText(/papel/i)).toBeNull()
  })

  it("picks Coni as the author when Lo dijo Coni is chosen with no author", () => {
    render(<FormularioDeSubida autores={AUTORES} />)
    fireEvent.click(screen.getByRole("radio", { name: "Lo dijo Coni" }))
    expect(screen.getByText("Coni del Rosario")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Cambiar autor" })).toBeInTheDocument()
  })

  it("runs the rules before sending anything, and says the first problem", () => {
    render(<FormularioDeSubida autores={AUTORES} />)
    fireEvent.click(screen.getByRole("button", { name: "Subir" }))
    expect(screen.getByRole("alert")).toHaveTextContent("Pega un enlace o elige un archivo.")
    pegar("https://ejemplo.cl/nota")
    fireEvent.click(screen.getByRole("button", { name: "Subir" }))
    expect(screen.getByRole("alert")).toHaveTextContent("Elige el autor.")
    expect(crearMaterialAccion).not.toHaveBeenCalled()
  })

  it("has a quiet Cancelar back to the Biblioteca", () => {
    render(<FormularioDeSubida autores={AUTORES} />)
    expect(screen.getByRole("link", { name: "Cancelar" })).toHaveAttribute("href", "/biblioteca")
  })
})
