import { fireEvent, render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ListaDeImagenes } from "@/app/(app)/biblioteca/subir/lista-de-imagenes"

// jsdom has no blob URLs: each thumbnail is named after its file.
const crear = vi.fn((archivo: Blob) => `blob:${archivo instanceof File ? archivo.name : "x"}`)
const revocar = vi.fn()
Object.assign(URL, { createObjectURL: crear, revokeObjectURL: revocar })

const imagen = (nombre: string) => new File(["x"], nombre, { type: "image/png" })
const TRES = [imagen("uno.png"), imagen("dos.png"), imagen("tres.png")]

beforeEach(() => vi.clearAllMocks())

describe("ListaDeImagenes", () => {
  it("shows each image in order with a thumbnail and its name", () => {
    render(<ListaDeImagenes archivos={TRES} ocupado={false} alMover={vi.fn()} alQuitar={vi.fn()} />)
    const lista = screen.getByRole("list", { name: "Imágenes en orden" })
    const filas = within(lista).getAllByRole("listitem")
    expect(filas.map((fila) => fila.getAttribute("data-nombre"))).toEqual(["uno.png", "dos.png", "tres.png"])
    expect(screen.getByRole("img", { name: "Imagen 1: uno.png" })).toHaveAttribute("src", "blob:uno.png")
    expect(within(filas[1] as HTMLElement).getByText("dos.png")).toBeInTheDocument()
  })

  it("moves an image before or after, and never past either end", () => {
    const alMover = vi.fn()
    render(<ListaDeImagenes archivos={TRES} ocupado={false} alMover={alMover} alQuitar={vi.fn()} />)
    expect(screen.getByRole("button", { name: "Mover la imagen 1 antes" })).toHaveAttribute("aria-disabled", "true")
    expect(screen.getByRole("button", { name: "Mover la imagen 3 después" })).toHaveAttribute("aria-disabled", "true")
    fireEvent.click(screen.getByRole("button", { name: "Mover la imagen 1 antes" }))
    expect(alMover).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "Mover la imagen 2 antes" }))
    fireEvent.click(screen.getByRole("button", { name: "Mover la imagen 2 después" }))
    expect(alMover.mock.calls).toEqual([
      [1, -1],
      [1, 1],
    ])
  })

  it("removes the image she asks for", () => {
    const alQuitar = vi.fn()
    render(<ListaDeImagenes archivos={TRES} ocupado={false} alMover={vi.fn()} alQuitar={alQuitar} />)
    fireEvent.click(screen.getByRole("button", { name: "Quitar la imagen 3" }))
    expect(alQuitar).toHaveBeenCalledWith(2)
  })

  it("changes nothing while uploading", () => {
    const alMover = vi.fn()
    const alQuitar = vi.fn()
    render(<ListaDeImagenes archivos={TRES} ocupado alMover={alMover} alQuitar={alQuitar} />)
    fireEvent.click(screen.getByRole("button", { name: "Mover la imagen 2 antes" }))
    fireEvent.click(screen.getByRole("button", { name: "Quitar la imagen 1" }))
    expect(alMover).not.toHaveBeenCalled()
    expect(alQuitar).not.toHaveBeenCalled()
  })

  it("frees the thumbnails it made when it goes away", () => {
    const { unmount } = render(<ListaDeImagenes archivos={TRES} ocupado={false} alMover={vi.fn()} alQuitar={vi.fn()} />)
    unmount()
    expect(revocar.mock.calls.map(([url]) => url)).toEqual(["blob:uno.png", "blob:dos.png", "blob:tres.png"])
  })
})
