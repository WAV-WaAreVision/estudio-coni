import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

type Respuesta = { ok: true; destino: string } | { ok: false; error: string }

const { aprobarBorradorDePilarAccion } = vi.hoisted(() => ({
  aprobarBorradorDePilarAccion: vi.fn(async (..._: unknown[]): Promise<Respuesta> => ({ ok: true, destino: DESTINO })),
}))
const { replace } = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace }) }))
vi.mock("@/app/(app)/biblioteca/temas/borradores/acciones", () => ({ aprobarBorradorDePilarAccion }))

import { AprobarPilar } from "@/app/(app)/biblioteca/temas/borradores/[id]/aprobar/aprobar-pilar"
import { AVISO_DE_LA_GUIA, type EtapaEditable } from "@/lib/dominio/biblioteca/borradores"

const ID = "11111111-2222-4333-8444-555555555555"
const DESTINO = "/biblioteca/temas?red=linkedin&pilar=99999999-2222-4333-8444-555555555555&aviso=pilar-aprobado"
const HOY = "2026-11-05"
const BORRADOR = {
  id: ID,
  red: "linkedin" as const,
  nombre: "Liderazgo sereno: decidir con IA",
  nombreCorto: "Liderazgo sereno",
  descripcion: "Cómo decide.",
  peso: 10,
}
const fila = (clave: string, nombre: string, peso: string) => ({ clave, nombre, peso })
const ETAPAS: EtapaEditable[] = [
  {
    desde: HOY,
    esHoy: true,
    etiqueta: "Hoy",
    filas: [
      fila("a", "Diagnóstico doble", "30"),
      fila("b", "Bienestar e impacto", "25"),
      fila("c", "Psicología en la mesa", "30"),
      fila("d", "Mujeres líderes", "15"),
      fila("nuevo", "Liderazgo sereno", "10"),
    ],
  },
  {
    desde: "2027-01-01",
    esHoy: false,
    etiqueta: "Desde el 1 de enero de 2027",
    filas: [
      fila("a", "Diagnóstico doble", "25"),
      fila("b", "Bienestar e impacto", "25"),
      fila("c", "Psicología en la mesa", "35"),
      fila("d", "Mujeres líderes", "15"),
      fila("nuevo", "Liderazgo sereno", "10"),
    ],
  },
]
const AVISO_DE_HOY = "Los pesos de LinkedIn suman 110 %. Puedes aprobar igual y ajustarlos después."
const AVISO_DE_ENERO =
  "Los pesos de LinkedIn desde el 1 de enero de 2027 suman 110 %. Puedes aprobar igual y ajustarlos después."

beforeEach(() => vi.clearAllMocks())

function abrir() {
  render(<AprobarPilar borrador={BORRADOR} etapas={ETAPAS} cancelar="/biblioteca/temas/borradores" />)
}

describe("AprobarPilar", () => {
  it("shows each stage as its own group with every weight and the new one, its live total and its warning", () => {
    abrir()
    const hoy = screen.getByRole("group", { name: "Hoy" })
    const enero = screen.getByRole("group", { name: "Desde el 1 de enero de 2027" })
    expect(within(hoy).getByLabelText("Liderazgo sereno · nuevo, Hoy")).toHaveValue("10")
    expect(within(enero).getByLabelText("Psicología en la mesa, Desde el 1 de enero de 2027")).toHaveValue("35")
    // Each total and each warning is a polite status (`<output>`): read by its text, inside its stage.
    expect(within(hoy).getByText("Total: 110 %").tagName).toBe("OUTPUT")
    expect(within(hoy).getByText(AVISO_DE_HOY)).toBeInTheDocument()
    expect(within(enero).getByText(AVISO_DE_ENERO)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText("Diagnóstico doble, Hoy"), { target: { value: "20" } })
    expect(within(hoy).getByText("Total: 100 %")).toBeInTheDocument()
    expect(within(hoy).queryByText(/suman/)).toBeNull()
    expect(within(enero).getByText("Total: 110 %")).toBeInTheDocument()
  })

  it("approves with every stage's weights as numbers, the new one under «nuevo», even when they do not add up to 100", async () => {
    abrir()
    fireEvent.change(screen.getByLabelText("Liderazgo sereno · nuevo, Desde el 1 de enero de 2027"), {
      target: { value: "12,5" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Aprobar pilar" }))
    await waitFor(() =>
      expect(aprobarBorradorDePilarAccion).toHaveBeenCalledWith({
        id: ID,
        pesos: {
          [HOY]: { a: 30, b: 25, c: 30, d: 15, nuevo: 10 },
          "2027-01-01": { a: 25, b: 25, c: 35, d: 15, nuevo: 12.5 },
        },
      }),
    )
    await waitFor(() => expect(replace).toHaveBeenCalledWith(DESTINO))
  })

  it("never approves twice: a tap on the busy button keeps the trip going and sends nothing more", async () => {
    abrir()
    const boton = screen.getByRole("button", { name: "Aprobar pilar" })
    fireEvent.click(boton)
    await waitFor(() => expect(replace).toHaveBeenCalledWith(DESTINO))
    fireEvent.pointerDown(boton)
    fireEvent.submit(boton.closest("form") as HTMLFormElement)
    expect(boton).toHaveAttribute("aria-busy", "true")
    expect(aprobarBorradorDePilarAccion).toHaveBeenCalledTimes(1)
  })

  it("names the weight it cannot read with its stage, focuses it and approves nothing", () => {
    abrir()
    const campo = screen.getByLabelText("Bienestar e impacto, Desde el 1 de enero de 2027")
    fireEvent.change(campo, { target: { value: "" } })
    expect(
      within(screen.getByRole("group", { name: "Desde el 1 de enero de 2027" })).getByText(
        "Total: falta un peso válido",
      ),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Aprobar pilar" }))
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Escribe el peso de Bienestar e impacto (Desde el 1 de enero de 2027) como un número mayor que 0 y hasta 100.",
    )
    expect(campo).toHaveFocus()
    expect(campo).toHaveAttribute("aria-invalid", "true")
    expect(screen.getByLabelText("Bienestar e impacto, Hoy")).not.toHaveAttribute("aria-invalid")
    expect(aprobarBorradorDePilarAccion).not.toHaveBeenCalled()
  })

  it("says the guide is not updated by the app, and a refusal", async () => {
    aprobarBorradorDePilarAccion.mockResolvedValueOnce({ ok: false, error: "Ese nombre ya lo tiene otro pilar." })
    abrir()
    expect(screen.getByText(AVISO_DE_LA_GUIA)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Aprobar pilar" }))
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Ese nombre ya lo tiene otro pilar."))
    expect(screen.getByRole("link", { name: "Cancelar" })).toHaveAttribute("href", "/biblioteca/temas/borradores")
  })
})
