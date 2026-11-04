import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { cambiar } = vi.hoisted(() => ({
  cambiar: vi.fn(async (..._: unknown[]): Promise<{ ok: true } | { ok: false; error: string }> => ({ ok: true })),
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }))
vi.mock("@/app/(app)/biblioteca/acciones", () => ({ cambiarPilaresAccion: cambiar }))

import { PilaresDelTema } from "@/app/(app)/biblioteca/temas/[id]/pilares-del-tema"
import { pilaresDeRedes, pilaresDeTema } from "@/lib/dominio/pilares"
import { PILARES_DE_PRUEBA } from "../fixtures/pilares"

const TEMA = "11111111-2222-4333-8444-555555555555"
const OPCIONES = pilaresDeRedes(PILARES_DE_PRUEBA)
const id = (slug: string) => PILARES_DE_PRUEBA.find((p) => p.slug === slug)?.id ?? ""
const PILARES = pilaresDeTema(PILARES_DE_PRUEBA, [
  { pilarId: id("bienestar-e-impacto"), fuerza: "alta" },
  { pilarId: id("diagnostico-doble"), fuerza: "media" },
])

const mostrar = () => render(<PilaresDelTema temaId={TEMA} pilares={PILARES} opciones={OPCIONES} />)

beforeEach(() => vi.clearAllMocks())

describe("PilaresDelTema", () => {
  it("says one line per network and never «principal»", () => {
    mostrar()
    const seccion = screen.getByRole("region", { name: "Pilares" })
    expect(
      within(seccion)
        .getAllByRole("listitem")
        .map((linea) => linea.textContent),
    ).toEqual(["LinkedIn: Bienestar e impacto · También toca: Diagnóstico doble", "Sin pilar en Instagram"])
    expect(seccion.textContent?.toLowerCase()).not.toContain("principal")
  })

  it("changes a network's pillar, adds a secondary, gives Instagram a pillar and the layer, and saves her rows", async () => {
    mostrar()
    fireEvent.click(screen.getByRole("button", { name: "Cambiar pilares" }))
    fireEvent.change(screen.getByLabelText("Pilar en LinkedIn"), { target: { value: "psicologia-en-la-mesa" } })
    fireEvent.click(screen.getByRole("checkbox", { name: "Mujeres líderes" }))
    fireEvent.change(screen.getByLabelText("Pilar en Instagram"), { target: { value: "mi-nueva-partida" } })
    fireEvent.click(screen.getByRole("switch", { name: "Capa TDAH" }))
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }))
    await waitFor(() =>
      expect(cambiar).toHaveBeenCalledWith({
        temaId: TEMA,
        filas: [
          { pilar: "psicologia-en-la-mesa", fuerza: "alta" },
          { pilar: "diagnostico-doble", fuerza: "media" },
          { pilar: "mujeres-lideres", fuerza: "media" },
          { pilar: "mi-nueva-partida", fuerza: "alta" },
          { pilar: "capa-tdah", fuerza: null },
        ],
      }),
    )
    await waitFor(() => expect(screen.queryByRole("button", { name: "Guardar" })).toBeNull())
  })

  it("offers «También toca» only in a network with a pillar, never that pillar itself", () => {
    mostrar()
    fireEvent.click(screen.getByRole("button", { name: "Cambiar pilares" }))
    const linkedin = screen.getByRole("group", { name: "También toca en LinkedIn" })
    expect(within(linkedin).queryByRole("checkbox", { name: "Bienestar e impacto" })).toBeNull()
    expect(within(linkedin).getByRole("checkbox", { name: "Diagnóstico doble" })).toBeChecked()
    expect(screen.queryByRole("group", { name: "También toca en Instagram" })).toBeNull()
    expect(
      within(screen.getByLabelText("Pilar en Instagram"))
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Sin pilar en Instagram", "Game Over Impostora", "Mi nueva partida", "Inteligencia emocional"])
  })

  it("says the refusal and keeps the form open; Cancelar puts back what was there", async () => {
    cambiar.mockResolvedValueOnce({ ok: false, error: "Ese tema ya no existe." })
    mostrar()
    fireEvent.click(screen.getByRole("button", { name: "Cambiar pilares" }))
    fireEvent.change(screen.getByLabelText("Pilar en LinkedIn"), { target: { value: "" } })
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }))
    expect(await screen.findByText("Ese tema ya no existe.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }))
    fireEvent.click(screen.getByRole("button", { name: "Cambiar pilares" }))
    expect(screen.getByLabelText("Pilar en LinkedIn")).toHaveValue("bienestar-e-impacto")
  })

  it("takes the focus to the first field on opening and back to Cambiar pilares on saving or cancelling", async () => {
    mostrar()
    fireEvent.click(screen.getByRole("button", { name: "Cambiar pilares" }))
    await waitFor(() => expect(screen.getByLabelText("Pilar en LinkedIn")).toHaveFocus())
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "Cambiar pilares" })).toHaveFocus())
    fireEvent.click(screen.getByRole("button", { name: "Cambiar pilares" }))
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "Cambiar pilares" })).toHaveFocus())
  })
})
