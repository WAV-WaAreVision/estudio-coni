import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import ErrorDePaginaDeIa from "@/app/l/ia/error"
import PaginaDeIa from "@/app/l/ia/page"
import { leerTransparenciaVigente } from "@/lib/transparencia/publica"

vi.mock("@/lib/transparencia/publica", () => ({ clienteAnonimo: vi.fn(() => ({})), leerTransparenciaVigente: vi.fn() }))
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND")
  }),
}))

const leer = vi.mocked(leerTransparenciaVigente)

describe("/l/ia", () => {
  it("shows the published text as paragraphs, as text, with the day it was updated", async () => {
    leer.mockResolvedValue({ texto: "Primero.\n\nDos <b>tres</b>.", creadaEn: "2026-11-02T15:00:00Z" })

    const { container } = render(await PaginaDeIa())

    expect(screen.getByRole("heading", { level: 1, name: "Cómo uso IA en mi contenido" })).toBeInTheDocument()
    expect(screen.getByText("Constanza del Rosario")).toBeInTheDocument()
    expect(screen.getByText("Dos <b>tres</b>.")).toBeInTheDocument()
    expect(container.querySelector("b")).toBeNull()
    expect(screen.getByText("Actualizado el 2 de noviembre de 2026.")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Volver a mis enlaces" })).toHaveAttribute("href", "/l")
  })

  it("is a 404 while nothing is published", async () => {
    leer.mockResolvedValue(null)
    await expect(PaginaDeIa()).rejects.toThrow("NEXT_NOT_FOUND")
  })

  it("lets a database failure reach the error page instead of a 404", async () => {
    leer.mockRejectedValue(new Error("No pude leer la página de IA: tiempo agotado"))
    await expect(PaginaDeIa()).rejects.toThrow("No pude leer la página de IA")
  })

  it("answers a failure with the page's look, one sentence and the way back", () => {
    const registro = vi.spyOn(console, "error").mockImplementation(() => {})

    render(<ErrorDePaginaDeIa error={new Error("caída")} reset={() => {}} />)

    expect(screen.getByRole("heading", { level: 1, name: "Cómo uso IA en mi contenido" })).toBeInTheDocument()
    expect(screen.getByText("No pude cargar esta página. Inténtalo de nuevo en unos minutos.")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Volver a mis enlaces" })).toHaveAttribute("href", "/l")
    expect(registro).toHaveBeenCalled()
    registro.mockRestore()
  })
})
