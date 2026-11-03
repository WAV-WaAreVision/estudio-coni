import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

type R = { ok: true } | { ok: false; error: string }
type Creado = { ok: true; materialId: string; subidas: unknown[] } | { ok: false; error: string }
type Pedido = { alAvanzar?: (hechos: number, total: number) => void }

const { crearMaterialAccion, confirmarMaterialAccion, descartarMaterialAccion, crearAutorAccion, subirArchivos, push } =
  vi.hoisted(() => ({
    crearMaterialAccion: vi.fn(async (..._: unknown[]): Promise<Creado> => ({ ok: false, error: "sin preparar" })),
    confirmarMaterialAccion: vi.fn(async (..._: unknown[]): Promise<R> => ({ ok: true })),
    descartarMaterialAccion: vi.fn(async (..._: unknown[]): Promise<R> => ({ ok: true })),
    crearAutorAccion: vi.fn(),
    subirArchivos: vi.fn(async (_: Pedido): Promise<void> => undefined),
    push: vi.fn(),
  }))
vi.mock("@/app/(app)/biblioteca/acciones", () => ({
  crearMaterialAccion,
  confirmarMaterialAccion,
  descartarMaterialAccion,
  crearAutorAccion,
}))
vi.mock("@/app/(app)/biblioteca/subir/subida-cliente", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/(app)/biblioteca/subir/subida-cliente")>()),
  subirArchivos,
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }) }))

import { FormularioDeSubida } from "@/app/(app)/biblioteca/subir/formulario-de-subida"
import { NO_PUDE_SUBIR } from "@/app/(app)/biblioteca/subir/subida-cliente"
import { ERROR_SESION_VENCIDA } from "@/lib/acciones/resultado"

const ID = "11111111-2222-4333-8444-555555555555"
const DANIELA = "d1111111-2222-4333-8444-555555555555"
const AUTORES = [{ id: DANIELA, nombre: "Daniela Ruiz", credencial: "investigadora", tipo: "persona", alias: [] }]
const SUBIDAS = [{ orden: 1, url: "https://r2.test/a", tipoContenido: "application/pdf" }]

function conUnPdf(): { pdf: File } {
  const { container } = render(<FormularioDeSubida autores={AUTORES} />)
  const pdf = new File(["%PDF-1.4"], "tesis.pdf", { type: "application/pdf" })
  const input = container.querySelector<HTMLInputElement>('input[type="file"][multiple]')
  if (!input) throw new Error("No está el campo de archivos")
  fireEvent.change(input, { target: { files: [pdf] } })
  fireEvent.change(screen.getByLabelText("Autor"), { target: { value: "Daniela" } })
  fireEvent.click(screen.getByRole("button", { name: "Daniela Ruiz, investigadora" }))
  fireEvent.click(screen.getByRole("radio", { name: "Estudio o libro" }))
  fireEvent.click(screen.getByRole("checkbox", { name: "Este material no contiene datos de pacientes" }))
  return { pdf }
}

const subir = () => fireEvent.click(screen.getByRole("button", { name: "Subir" }))

beforeEach(() => {
  vi.clearAllMocks()
  crearMaterialAccion.mockResolvedValue({ ok: true, materialId: ID, subidas: SUBIDAS })
})

describe("FormularioDeSubida: the upload", () => {
  it("creates the material, puts the file, confirms it and opens the list with the notice", async () => {
    const { pdf } = conUnPdf()
    subir()

    await waitFor(() => expect(push).toHaveBeenCalledWith("/biblioteca?subido=1"))
    expect(crearMaterialAccion).toHaveBeenCalledWith({
      tipo: "documento",
      titulo: "",
      autorId: DANIELA,
      rol: "evidencia",
      declaracion: true,
      url: "",
      textoPegado: "",
      referencia: "",
      archivos: [{ nombre: "tesis.pdf", tamano: pdf.size }],
    })
    expect(subirArchivos).toHaveBeenCalledWith(expect.objectContaining({ subidas: SUBIDAS, archivos: [pdf] }))
    expect(confirmarMaterialAccion).toHaveBeenCalledWith(ID)
    expect(descartarMaterialAccion).not.toHaveBeenCalled()
  })

  it("says which file is going up, and hides Cancelar while it does", async () => {
    let soltar: () => void = () => undefined
    subirArchivos.mockImplementationOnce(async ({ alAvanzar }) => {
      alAvanzar?.(0, 1)
      await new Promise<void>((resolver) => {
        soltar = resolver
      })
    })
    conUnPdf()
    subir()

    expect(await screen.findByText("Subiendo 1 de 1")).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Cancelar" })).toBeNull()
    soltar()
    await waitFor(() => expect(push).toHaveBeenCalledWith("/biblioteca?subido=1"))
  })

  it("throws the material away when a file fails to go up, says which one and stays", async () => {
    subirArchivos.mockRejectedValueOnce(new Error("No pude subir tesis.pdf. Revisa tu conexión e inténtalo de nuevo."))
    conUnPdf()
    subir()

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No pude subir tesis.pdf. Revisa tu conexión e inténtalo de nuevo.",
    )
    expect(descartarMaterialAccion).toHaveBeenCalledWith(ID)
    expect(confirmarMaterialAccion).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
    expect(screen.getByRole("link", { name: "Cancelar" })).toBeInTheDocument()
  })

  it("throws the material away when the signed uploads do not match its files, in Coni's words", async () => {
    subirArchivos.mockRejectedValueOnce(new Error(NO_PUDE_SUBIR))
    conUnPdf()
    subir()

    expect(await screen.findByRole("alert")).toHaveTextContent(NO_PUDE_SUBIR)
    expect(descartarMaterialAccion).toHaveBeenCalledWith(ID)
    expect(confirmarMaterialAccion).not.toHaveBeenCalled()
  })

  it("says why when the confirmation is refused, and stays", async () => {
    confirmarMaterialAccion.mockResolvedValueOnce({ ok: false, error: "Ese archivo pesa más de 2 GB." })
    conUnPdf()
    subir()
    expect(await screen.findByRole("alert")).toHaveTextContent("Ese archivo pesa más de 2 GB.")
    expect(push).not.toHaveBeenCalled()
  })

  it("says the generic notice when an action does not answer at all", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    crearMaterialAccion.mockRejectedValueOnce(new TypeError("Failed to fetch"))
    conUnPdf()
    subir()
    expect(await screen.findByRole("alert")).toHaveTextContent("Algo falló de nuestro lado.")
    expect(subirArchivos).not.toHaveBeenCalled()
  })

  it("goes back to sign in when the session ended", async () => {
    crearMaterialAccion.mockResolvedValueOnce({ ok: false, error: ERROR_SESION_VENCIDA })
    conUnPdf()
    subir()
    await waitFor(() => expect(push).toHaveBeenCalledWith("/ingreso"))
    expect(subirArchivos).not.toHaveBeenCalled()
  })
})
