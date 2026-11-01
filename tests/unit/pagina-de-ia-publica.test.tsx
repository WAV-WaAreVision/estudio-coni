import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import ErrorDePaginaDeIa from "@/app/l/ia/error"
import PaginaNoPublicada from "@/app/l/ia/not-found"
import PaginaDeIa from "@/app/l/ia/page"
import PaginaPublica from "@/app/l/page"
import { leerEnlaces } from "@/lib/enlaces/config"
import { leerTransparenciaVigente } from "@/lib/transparencia/publica"

vi.mock("@/lib/transparencia/publica", () => ({ clienteAnonimo: vi.fn(() => ({})), leerTransparenciaVigente: vi.fn() }))
vi.mock("@/lib/enlaces/config", () => ({ leerEnlaces: vi.fn() }))
vi.mock("@/lib/enlaces/deps-reales", () => ({ clienteDeEnlaces: vi.fn(() => ({})) }))
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND")
  }),
}))

const leer = vi.mocked(leerTransparenciaVigente)
const enlaces = vi.mocked(leerEnlaces)

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

  it("says the page is not published yet and offers the way back when there is nothing to show", () => {
    render(<PaginaNoPublicada />)

    expect(screen.getByText("Esta página todavía no está publicada.")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Volver a mis enlaces" })).toHaveAttribute("href", "/l")
  })
})

describe("/l footer link to the AI page", () => {
  beforeEach(() => {
    enlaces.mockResolvedValue([])
  })

  it("shows the link when a version is published", async () => {
    leer.mockResolvedValue({ texto: "Uso IA.", creadaEn: "2026-11-02T15:00:00Z" })

    render(await PaginaPublica())

    expect(screen.getByRole("link", { name: "Cómo uso IA en mi contenido" })).toHaveAttribute("href", "/l/ia")
  })

  it("hides the link while nothing is published", async () => {
    leer.mockResolvedValue(null)

    render(await PaginaPublica())

    expect(screen.queryByRole("link", { name: "Cómo uso IA en mi contenido" })).toBeNull()
  })

  it("hides the link and logs the reason when the read fails, keeping the page up", async () => {
    const registro = vi.spyOn(console, "error").mockImplementation(() => {})
    const falla = new Error("No pude leer la página de IA: tiempo agotado")
    leer.mockRejectedValue(falla)

    render(await PaginaPublica())

    expect(screen.getByRole("heading", { level: 1, name: "Constanza del Rosario" })).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Cómo uso IA en mi contenido" })).toBeNull()
    expect(registro).toHaveBeenCalledWith("/l no pudo leer la página de IA", falla)
    registro.mockRestore()
  })
})
