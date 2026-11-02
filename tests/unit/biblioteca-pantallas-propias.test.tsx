import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import ErrorDeLaBiblioteca from "@/app/(app)/biblioteca/error"
import CargandoLaBiblioteca from "@/app/(app)/biblioteca/loading"
import NoEncontradoEnLaBiblioteca from "@/app/(app)/biblioteca/not-found"

describe("the Biblioteca's own pages, in plain Spanish (4m)", () => {
  it("loads with a skeleton, never a spinner", () => {
    render(<CargandoLaBiblioteca />)
    expect(screen.getByRole("status", { name: "Cargando" })).toBeInTheDocument()
  })

  it("says it could not load, logs why for WAV and lets her try again", () => {
    const registro = vi.spyOn(console, "error").mockImplementation(() => {})
    const reset = vi.fn()
    render(<ErrorDeLaBiblioteca error={new Error("boom")} reset={reset} />)
    expect(screen.getByText("No pude cargar la Biblioteca.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Intentar de nuevo" }))
    expect(reset).toHaveBeenCalled()
    expect(registro).toHaveBeenCalledWith("Una pantalla de la Biblioteca no pudo cargar", expect.any(Error))
    registro.mockRestore()
  })

  it("says it did not find it and where the way back goes, on the left (4f)", () => {
    render(<NoEncontradoEnLaBiblioteca />)
    expect(screen.getByRole("heading", { name: "No encontré lo que buscabas", level: 1 })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Materiales" })).toHaveAttribute("href", "/biblioteca")
  })
})
