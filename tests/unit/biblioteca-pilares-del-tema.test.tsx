import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { cambiar, replace } = vi.hoisted(() => ({
  cambiar: vi.fn(async (..._: unknown[]): Promise<{ ok: true } | { ok: false; error: string }> => ({ ok: true })),
  replace: vi.fn(),
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace }) }))
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
const lineas = () =>
  within(screen.getByRole("region", { name: "Pilares" }))
    .getAllByRole("listitem")
    .map((linea) => linea.textContent)

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
    // The lines redraw with the saved pillars: the revalidated tree alone can lose the race with older prefetches.
    expect(replace).toHaveBeenCalledWith(expect.stringMatching(/[?&]v=\d+/), { scroll: false })
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
    cambiar.mockResolvedValueOnce({ ok: false, error: "Ese tema ya no existe. Recarga la página." })
    mostrar()
    fireEvent.click(screen.getByRole("button", { name: "Cambiar pilares" }))
    fireEvent.change(screen.getByLabelText("Pilar en LinkedIn"), { target: { value: "" } })
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }))
    expect(await screen.findByText("Ese tema ya no existe. Recarga la página.")).toBeInTheDocument()
    expect(replace).not.toHaveBeenCalled()
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

  it("keeps showing and reopening what she saved until the page brings it, then follows the page", async () => {
    const { rerender } = mostrar()
    fireEvent.click(screen.getByRole("button", { name: "Cambiar pilares" }))
    fireEvent.change(screen.getByLabelText("Pilar en LinkedIn"), { target: { value: "psicologia-en-la-mesa" } })
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }))
    await waitFor(() => expect(screen.queryByRole("button", { name: "Guardar" })).toBeNull())
    expect(lineas()).toEqual([
      "LinkedIn: Psicología en la mesa · También toca: Diagnóstico doble",
      "Sin pilar en Instagram",
    ])
    fireEvent.click(screen.getByRole("button", { name: "Cambiar pilares" }))
    expect(screen.getByLabelText("Pilar en LinkedIn")).toHaveValue("psicologia-en-la-mesa")
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }))

    const guardados = pilaresDeTema(PILARES_DE_PRUEBA, [
      { pilarId: id("psicologia-en-la-mesa"), fuerza: "alta" },
      { pilarId: id("diagnostico-doble"), fuerza: "media" },
    ])
    rerender(<PilaresDelTema temaId={TEMA} pilares={guardados} opciones={OPCIONES} />)
    // Another change arrives from the page (another tab): the page wins once it had brought her save.
    const despues = pilaresDeTema(PILARES_DE_PRUEBA, [{ pilarId: id("mujeres-lideres"), fuerza: "alta" }])
    rerender(<PilaresDelTema temaId={TEMA} pilares={despues} opciones={OPCIONES} />)
    expect(lineas()).toEqual(["LinkedIn: Mujeres líderes", "Sin pilar en Instagram"])
  })

  it("closes without saving when nothing changed, so her topic keeps the rows it has", async () => {
    mostrar()
    fireEvent.click(screen.getByRole("button", { name: "Cambiar pilares" }))
    fireEvent.click(screen.getByRole("checkbox", { name: "Mujeres líderes" }))
    fireEvent.click(screen.getByRole("checkbox", { name: "Mujeres líderes" }))
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "Cambiar pilares" })).toHaveFocus())
    expect(cambiar).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
  })

  it("leaves out a pillar retired since, which the form cannot show and the database would refuse", async () => {
    const catalogo = PILARES_DE_PRUEBA.map((pilar) =>
      pilar.slug === "mujeres-lideres" || pilar.slug === "psicologia-en-la-mesa" ? { ...pilar, activa: false } : pilar,
    )
    const opciones = pilaresDeRedes(catalogo)
    const conPrincipalRetirado = pilaresDeTema(catalogo, [
      { pilarId: id("psicologia-en-la-mesa"), fuerza: "alta" },
      { pilarId: id("diagnostico-doble"), fuerza: "media" },
    ])
    const { unmount } = render(<PilaresDelTema temaId={TEMA} pilares={conPrincipalRetirado} opciones={opciones} />)
    fireEvent.click(screen.getByRole("button", { name: "Cambiar pilares" }))
    fireEvent.change(screen.getByLabelText("Pilar en Instagram"), { target: { value: "mi-nueva-partida" } })
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }))
    await waitFor(() =>
      expect(cambiar).toHaveBeenLastCalledWith({
        temaId: TEMA,
        filas: [{ pilar: "mi-nueva-partida", fuerza: "alta" }],
      }),
    )
    unmount()

    const conSecundarioRetirado = pilaresDeTema(catalogo, [
      { pilarId: id("bienestar-e-impacto"), fuerza: "alta" },
      { pilarId: id("mujeres-lideres"), fuerza: "media" },
    ])
    render(<PilaresDelTema temaId={TEMA} pilares={conSecundarioRetirado} opciones={opciones} />)
    fireEvent.click(screen.getByRole("button", { name: "Cambiar pilares" }))
    fireEvent.click(screen.getByRole("checkbox", { name: "Diagnóstico doble" }))
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }))
    await waitFor(() =>
      expect(cambiar).toHaveBeenLastCalledWith({
        temaId: TEMA,
        filas: [
          { pilar: "bienestar-e-impacto", fuerza: "alta" },
          { pilar: "diagnostico-doble", fuerza: "media" },
        ],
      }),
    )
  })

  it("holds the fields while it saves, then says it saved in one polite note", async () => {
    let terminar: (resultado: { ok: true }) => void = () => {}
    cambiar.mockImplementationOnce(
      () =>
        new Promise((resolver) => {
          terminar = resolver
        }),
    )
    mostrar()
    expect(screen.queryByText("Listo, guardé los pilares.")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Cambiar pilares" }))
    fireEvent.change(screen.getByLabelText("Pilar en Instagram"), { target: { value: "mi-nueva-partida" } })
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }))
    await waitFor(() => expect(screen.getByLabelText("Pilar en LinkedIn")).toBeDisabled())
    expect(screen.getByRole("switch", { name: "Capa TDAH" })).toBeDisabled()
    terminar({ ok: true })
    const nota = await screen.findByText("Listo, guardé los pilares.")
    expect(nota.closest("[aria-live='polite']")).not.toBeNull()
    expect(document.querySelectorAll("[aria-live]")).toHaveLength(1)
    fireEvent.click(screen.getByRole("button", { name: "Cambiar pilares" }))
    expect(screen.queryByText("Listo, guardé los pilares.")).toBeNull()
  })

  it("says under a network left without a pillar that it takes no «También toca»", () => {
    mostrar()
    fireEvent.click(screen.getByRole("button", { name: "Cambiar pilares" }))
    expect(screen.getByLabelText("Pilar en Instagram")).toHaveAccessibleDescription(
      "Sin pilar, esta red no lleva «También toca».",
    )
    expect(screen.getByLabelText("Pilar en LinkedIn")).not.toHaveAccessibleDescription()
    fireEvent.change(screen.getByLabelText("Pilar en LinkedIn"), { target: { value: "" } })
    expect(screen.getByLabelText("Pilar en LinkedIn")).toHaveAccessibleDescription(
      "Sin pilar, esta red no lleva «También toca».",
    )
  })
})
