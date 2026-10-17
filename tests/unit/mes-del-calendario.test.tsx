import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { MesDelCalendario } from "@/components/mes-del-calendario"
import { construirCalendario, type PiezaDeCalendario } from "@/lib/calendario/modelo"
import { PILARES_DE_PRUEBA } from "../fixtures/pilares"

// Tuesday 6 October 2026, 10:30 in Santiago (UTC-3).
const AHORA = Date.parse("2026-10-06T13:30:00.000Z")
const HORARIO = { dias: [2, 4, 6], hora: "19:00", zona: "America/Santiago" }

const publicada: PiezaDeCalendario = {
  id: "p1",
  titulo: "Si van a discutir",
  estado: "programado",
  pilar: "pareja",
  publicarEn: "2026-10-08T22:00:00.000Z",
  creadaEn: "2026-10-01T12:00:00.000Z",
  destinos: ["instagram"] as const,
  pendientes: [],
}

function montar(piezas: PiezaDeCalendario[]) {
  const { mes } = construirCalendario({ piezas, horario: HORARIO, ahora: AHORA, pilares: PILARES_DE_PRUEBA })
  render(<MesDelCalendario celdas={mes.celdas} />)
}

describe("MesDelCalendario", () => {
  it("makes a day with a publication a link that a screen reader hears with its title", () => {
    montar([publicada])
    const enlace = screen.getByRole("link", { name: /jueves 8: Pareja y conversación/ })
    expect(enlace).toHaveAttribute("href", "/calendario?vista=agenda")
  })

  it("leaves a day without publications as plain text, not a link", () => {
    montar([publicada])
    expect(screen.getAllByRole("link")).toHaveLength(1)
  })

  it("marks today with aria-current on the ink disc", () => {
    montar([])
    const hoy = screen.getByText("6").closest("[aria-current]")
    expect(hoy).toHaveAttribute("aria-current", "date")
    expect(screen.getByText("6")).toHaveClass("bg-tinta", "text-luz")
  })

  it("draws at most two dots in ink, never a pillar colour", () => {
    montar([publicada, { ...publicada, id: "p2", pilar: "deseo" }, { ...publicada, id: "p3", pilar: "limites" }])
    const enlace = screen.getByRole("link", { name: /jueves 8/ })
    expect(enlace.querySelectorAll("i")).toHaveLength(2)
    expect(enlace.innerHTML).not.toMatch(/pilar/)
  })
})
