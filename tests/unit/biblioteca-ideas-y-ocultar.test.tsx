import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

type R = { ok: true } | { ok: false; error: string }
const { ocultarIdeaAccion, replace } = vi.hoisted(() => ({
  ocultarIdeaAccion: vi.fn(async (..._: unknown[]): Promise<R> => ({ ok: true })),
  replace: vi.fn(),
}))
vi.mock("@/app/(app)/biblioteca/acciones", () => ({ ocultarIdeaAccion }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace }) }))

import { BotonOcultar } from "@/app/(app)/biblioteca/boton-ocultar"
import { ListaDeIdeas } from "@/app/(app)/biblioteca/lista-de-ideas"
import { idDeIdea } from "@/lib/dominio/biblioteca/ideas"

const ID = "11111111-2222-4333-8444-555555555555"
const IDEAS = [{ id: ID, texto: "Las pausas acordadas protegen.", tipo: "consejo", evidencia: "estudio" }]

beforeEach(() => vi.clearAllMocks())

describe("ListaDeIdeas (4h)", () => {
  it("shows each idea in her words, with its type and evidence folded under Detalle para WAV", () => {
    const { container } = render(<ListaDeIdeas etiqueta="Ideas de Daniela" ideas={IDEAS} />)
    const lista = screen.getByRole("list", { name: "Ideas de Daniela" })
    expect(within(lista).getByText("«Las pausas acordadas protegen.»")).toHaveAttribute("id", idDeIdea(ID))
    const detalle = container.querySelector("details")
    expect(detalle).not.toHaveAttribute("open")
    expect(detalle).toHaveTextContent("Detalle para WAV")
    expect(detalle).toHaveTextContent("Tipo de idea: Consejo")
    expect(detalle).toHaveTextContent("Evidencia: Estudio")
    expect(screen.queryByText(/Afirmaci/)).toBeNull()
  })

  it("draws each idea's action when there is one", () => {
    render(
      <ListaDeIdeas
        etiqueta="Ideas"
        ideas={IDEAS}
        accion={(idea) => <button type="button">{`Acción ${idea.id}`}</button>}
      />,
    )
    expect(screen.getByRole("button", { name: `Acción ${ID}` })).toBeInTheDocument()
  })
})

describe("BotonOcultar", () => {
  it("Ocultar hides the idea and goes to the address after hiding (D6)", async () => {
    render(<BotonOcultar ideaId={ID} oculta={false} despues={`/biblioteca/temas/t?oculta=${ID}`} />)
    fireEvent.click(screen.getByRole("button", { name: "Ocultar" }))
    await waitFor(() => expect(ocultarIdeaAccion).toHaveBeenCalledWith({ id: ID, oculta: true }))
    await waitFor(() => expect(replace).toHaveBeenCalledWith(`/biblioteca/temas/t?oculta=${ID}`, { scroll: false }))
  })

  it("Mostrar shows it again and redraws the page in place", async () => {
    render(<BotonOcultar ideaId={ID} oculta despues={null} />)
    fireEvent.click(screen.getByRole("button", { name: "Mostrar" }))
    await waitFor(() => expect(ocultarIdeaAccion).toHaveBeenCalledWith({ id: ID, oculta: false }))
    await waitFor(() => expect(replace).toHaveBeenCalledWith(expect.stringMatching(/^\/\?v=\d+$/), { scroll: false }))
  })

  it("points at the idea's text, so many of them read apart", () => {
    render(<BotonOcultar ideaId={ID} oculta={false} despues={null} />)
    expect(screen.getByRole("button", { name: "Ocultar" })).toHaveAttribute("aria-describedby", idDeIdea(ID))
  })

  it("says a refusal and goes nowhere", async () => {
    ocultarIdeaAccion.mockResolvedValueOnce({ ok: false, error: "Esa idea ya no existe." })
    render(<BotonOcultar ideaId={ID} oculta={false} despues="/biblioteca/temas" />)
    fireEvent.click(screen.getByRole("button", { name: "Ocultar" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Esa idea ya no existe.")
    expect(replace).not.toHaveBeenCalled()
  })
})
