import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ElegirAngulo } from "@/app/(app)/ideas/elegir-angulo"
import { ERROR_SESION_VENCIDA } from "@/lib/acciones/resultado"

const reemplazar = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: reemplazar }) }))

const ANGULOS = [
  { id: "11111111-1111-4111-8111-111111111111", slug: "lo-que-planteo", nombre: "Lo que planteo" },
  { id: "22222222-2222-4222-8222-222222222222", slug: "lo-que-construyo", nombre: "Lo que construyo" },
]
const IDEA = "33333333-3333-4333-8333-333333333333"

describe("ElegirAngulo", () => {
  it("renders nothing for a pillar without angles", () => {
    const { container } = render(<ElegirAngulo ideaId={IDEA} angulos={[]} elegido={null} cambiar={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it("offers the angles, then «Sin ángulo», with hers chosen", () => {
    render(<ElegirAngulo ideaId={IDEA} angulos={ANGULOS} elegido={ANGULOS[1]?.id ?? null} cambiar={vi.fn()} />)
    const campo = screen.getByLabelText("Ángulo")
    expect(campo).toHaveDisplayValue("Lo que construyo")
    expect([...campo.querySelectorAll("option")].map((o) => o.textContent)).toEqual([
      "Lo que planteo",
      "Lo que construyo",
      "Sin ángulo",
    ])
  })

  it("saves on change, says so and redraws in place, never navigating elsewhere", async () => {
    const cambiar = vi.fn(async () => ({ ok: true as const }))
    render(<ElegirAngulo ideaId={IDEA} angulos={ANGULOS} elegido={null} cambiar={cambiar} />)
    fireEvent.change(screen.getByLabelText("Ángulo"), { target: { value: ANGULOS[0]?.id } })
    await screen.findByText("Listo, guardé el ángulo.")
    expect(cambiar).toHaveBeenCalledWith(IDEA, ANGULOS[0]?.id)
    await waitFor(() => expect(reemplazar).toHaveBeenCalled())
    expect(String(reemplazar.mock.calls.at(-1)?.[0])).toMatch(/[?&]v=\d+/)
  })

  it("clears the angle with «Sin ángulo»", async () => {
    const cambiar = vi.fn(async () => ({ ok: true as const }))
    render(<ElegirAngulo ideaId={IDEA} angulos={ANGULOS} elegido={ANGULOS[0]?.id ?? null} cambiar={cambiar} />)
    fireEvent.change(screen.getByLabelText("Ángulo"), { target: { value: "" } })
    await waitFor(() => expect(cambiar).toHaveBeenCalledWith(IDEA, null))
  })

  it("puts the old angle back and says why when it is refused", async () => {
    const cambiar = vi.fn(async () => ({
      ok: false as const,
      error: "Ya firmaste el guion: el ángulo quedó como estaba.",
    }))
    render(<ElegirAngulo ideaId={IDEA} angulos={ANGULOS} elegido={ANGULOS[0]?.id ?? null} cambiar={cambiar} />)
    fireEvent.change(screen.getByLabelText("Ángulo"), { target: { value: ANGULOS[1]?.id } })
    await screen.findByText("Ya firmaste el guion: el ángulo quedó como estaba.")
    expect(screen.getByLabelText("Ángulo")).toHaveDisplayValue("Lo que planteo")
  })

  it("puts the old angle back when her session ended, on her way to sign in", async () => {
    const cambiar = vi.fn(async () => ({ ok: false as const, error: ERROR_SESION_VENCIDA }))
    render(<ElegirAngulo ideaId={IDEA} angulos={ANGULOS} elegido={ANGULOS[0]?.id ?? null} cambiar={cambiar} />)
    fireEvent.change(screen.getByLabelText("Ángulo"), { target: { value: ANGULOS[1]?.id } })
    await waitFor(() => expect(cambiar).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByLabelText("Ángulo")).toHaveDisplayValue("Lo que planteo"))
  })

  it("takes a newer angle from the server, and keeps its note when the redraw brings the one it saved", async () => {
    const cambiar = vi.fn(async () => ({ ok: true as const }))
    const { rerender } = render(<ElegirAngulo ideaId={IDEA} angulos={ANGULOS} elegido={null} cambiar={cambiar} />)
    fireEvent.change(screen.getByLabelText("Ángulo"), { target: { value: ANGULOS[0]?.id } })
    await screen.findByText("Listo, guardé el ángulo.")
    rerender(<ElegirAngulo ideaId={IDEA} angulos={ANGULOS} elegido={ANGULOS[0]?.id ?? null} cambiar={cambiar} />)
    expect(screen.getByText("Listo, guardé el ángulo.")).toBeInTheDocument()
    rerender(<ElegirAngulo ideaId={IDEA} angulos={ANGULOS} elegido={ANGULOS[1]?.id ?? null} cambiar={cambiar} />)
    expect(screen.getByLabelText("Ángulo")).toHaveDisplayValue("Lo que construyo")
  })

  it("ignores a change while one is saving", async () => {
    let terminar: (valor: { ok: true }) => void = () => {}
    const cambiar = vi.fn(
      () =>
        new Promise<{ ok: true }>((resolver) => {
          terminar = resolver
        }),
    )
    render(<ElegirAngulo ideaId={IDEA} angulos={ANGULOS} elegido={null} cambiar={cambiar} />)
    const campo = screen.getByLabelText("Ángulo")
    fireEvent.change(campo, { target: { value: ANGULOS[0]?.id } })
    await waitFor(() => expect(campo).toBeDisabled())
    fireEvent.change(campo, { target: { value: ANGULOS[1]?.id } })
    terminar({ ok: true })
    await screen.findByText("Listo, guardé el ángulo.")
    expect(cambiar).toHaveBeenCalledTimes(1)
  })
})
