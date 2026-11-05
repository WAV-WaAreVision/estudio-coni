import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { IdeaPropia } from "@/app/(app)/ideas/idea-propia"
import { pilaresParaElegir } from "@/lib/dominio/pilares"
import { PILARES_DE_PRUEBA } from "../fixtures/pilares"

const PILARES = pilaresParaElegir(PILARES_DE_PRUEBA).map(({ slug, nombre, nombreCorto, red, angulos }) => ({
  slug,
  nombre,
  nombreCorto,
  red,
  angulos: angulos.map(({ id, slug: deAngulo, nombre: deNombre }) => ({ id, slug: deAngulo, nombre: deNombre })),
}))
const PSICOLOGIA = "Psicología en la mesa: la psicología donde se construye la IA"

function montar() {
  const crear = vi.fn(async () => ({ ok: true as const, id: "nueva" }))
  const proponer = vi.fn(async () => ({
    ok: true as const,
    propuesta: { pilar: "psicologia-en-la-mesa", formato: "Mito o realidad", alertas: [], angulo: "lo-que-construyo" },
  }))
  render(<IdeaPropia proponer={proponer} crear={crear} pilares={PILARES} alGuardar={vi.fn()} alVolver={vi.fn()} />)
  return { crear }
}

async function proponer() {
  fireEvent.change(screen.getByLabelText("Tu idea"), { target: { value: "Construyo un modelo." } })
  fireEvent.click(screen.getByRole("button", { name: "Proponer pilar y alertas" }))
  await screen.findByRole("group", { name: "Ángulo" })
  // The confirmation shows before the proposal's transition ends; a tap while it is busy is ignored by design.
  await waitFor(() => expect(screen.getByRole("button", { name: "Guardar idea" })).not.toHaveAttribute("aria-busy"))
}

describe("IdeaPropia con ángulos", () => {
  it("shows Claude's angle under the pillar, and saves it", async () => {
    const { crear } = montar()
    await proponer()
    expect(screen.getByRole("radio", { name: "Lo que construyo" })).toBeChecked()
    fireEvent.click(screen.getByRole("button", { name: "Guardar idea" }))
    await waitFor(() => expect(crear).toHaveBeenCalledWith(expect.objectContaining({ angulo: "lo-que-construyo" })))
  })

  it("hides the angles for a pillar without them and forgets the angle when the pillar changes", async () => {
    const { crear } = montar()
    await proponer()
    fireEvent.click(screen.getByRole("radio", { name: "Mujeres líderes, IA y síndrome del impostor" }))
    expect(screen.queryByRole("group", { name: "Ángulo" })).toBeNull()
    fireEvent.click(screen.getByRole("radio", { name: PSICOLOGIA }))
    expect(screen.getByRole("radio", { name: "Sin ángulo" })).toBeChecked()
    fireEvent.click(screen.getByRole("button", { name: "Guardar idea" }))
    await waitFor(() => expect(crear).toHaveBeenCalledWith(expect.objectContaining({ angulo: null })))
  })

  it("saves once when she taps twice", async () => {
    const { crear } = montar()
    await proponer()
    const guardar = screen.getByRole("button", { name: "Guardar idea" })
    fireEvent.click(guardar)
    fireEvent.click(guardar)
    await waitFor(() => expect(crear).toHaveBeenCalledTimes(1))
  })
})
