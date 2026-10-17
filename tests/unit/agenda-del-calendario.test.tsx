import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { AgendaDelCalendario } from "@/components/agenda-del-calendario"
import type { Hueco, Ocupante } from "@/lib/calendario/modelo"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

function ocupante(extra: Partial<Ocupante>): Ocupante {
  return {
    piezaId: "p1",
    titulo: "Ser tu propia diosa",
    pilar: null,
    estado: "Falta tu firma: video y fecha",
    tono: "aviso",
    href: "/video/p1",
    provisional: true,
    propuesta: false,
    destinos: null,
    ...extra,
  }
}

const hueco = (instante: string, dia: string, o: Ocupante | null): Hueco => ({
  instante,
  dia,
  hora: "19:00",
  ocupante: o,
})
const ALTERNATIVAS = [
  { instante: "2026-10-20T22:00:00.000Z", etiqueta: "Martes 20 · 19:00" },
  { instante: "2026-10-24T22:00:00.000Z", etiqueta: "Sábado 24 · 19:00" },
]

function mostrar(huecos: Hueco[], porRepartir = 0) {
  const acciones = {
    repartir: vi.fn(async () => ({ ok: true as const, propuestas: porRepartir })),
    cambiar: vi.fn(async () => ({ ok: true as const })),
  }
  render(
    <AgendaDelCalendario
      semanas={[{ titulo: "Semana del 12 al 18 de octubre", huecos, libresMas: null }]}
      porRepartir={porRepartir}
      alternativas={ALTERNATIVAS}
      acciones={acciones}
    />,
  )
  return acciones
}

describe("AgendaDelCalendario: proposals", () => {
  it("says «propuesta» for a stored proposal and «lugar propuesto» for a place it only shows", () => {
    mostrar([
      hueco("2026-10-15T22:00:00.000Z", "Jueves 15", ocupante({ propuesta: true })),
      hueco("2026-10-17T22:00:00.000Z", "Sábado 17", ocupante({ piezaId: "p2", titulo: "Otro", propuesta: false })),
    ])
    expect(screen.getByText("Falta tu firma: video y fecha · propuesta")).toBeInTheDocument()
    expect(screen.getByText("Falta tu firma: video y fecha · lugar propuesto")).toBeInTheDocument()
  })

  it("offers Cambiar only under a stored proposal, with the free slots in line", async () => {
    const acciones = mostrar([
      hueco("2026-10-15T22:00:00.000Z", "Jueves 15", ocupante({ propuesta: true })),
      hueco("2026-10-17T22:00:00.000Z", "Sábado 17", ocupante({ piezaId: "p2", titulo: "Otro" })),
    ])
    expect(screen.getAllByRole("button", { name: /^Cambiar la fecha de/ })).toHaveLength(1)

    fireEvent.click(screen.getByRole("button", { name: "Cambiar la fecha de Ser tu propia diosa" }))
    const grupo = screen.getByRole("group", { name: "¿Qué otro día?" })
    expect(grupo).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Sábado 24 · 19:00" }))

    await waitFor(() => expect(acciones.cambiar).toHaveBeenCalledWith("p1", "2026-10-24T22:00:00.000Z"))
  })

  it("keeps the piece's link whole next to Cambiar", () => {
    mostrar([hueco("2026-10-15T22:00:00.000Z", "Jueves 15", ocupante({ propuesta: true }))])
    expect(screen.getByRole("link", { name: /Ser tu propia diosa/ })).toHaveAttribute("href", "/video/p1")
  })

  it("shows Repartir fechas with how many pieces wait, and says what it stored", async () => {
    const acciones = mostrar([], 2)
    expect(screen.getByText("2 piezas en camino sin fecha propuesta.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Repartir fechas" }))
    await waitFor(() => expect(acciones.repartir).toHaveBeenCalled())
    expect(await screen.findByText("Propuse fecha para 2 piezas. Puedes cambiarlas.")).toBeInTheDocument()
  })

  it("hides Repartir fechas when every unsigned piece already has a proposal", () => {
    mostrar([], 0)
    expect(screen.queryByRole("button", { name: "Repartir fechas" })).toBeNull()
  })
})
