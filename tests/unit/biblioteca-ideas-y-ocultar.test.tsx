import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

type R = { ok: true } | { ok: false; error: string }
const { ocultarIdeaAccion, replace } = vi.hoisted(() => ({
  ocultarIdeaAccion: vi.fn(async (..._: unknown[]): Promise<R> => ({ ok: true })),
  replace: vi.fn(),
}))
vi.mock("@/app/(app)/biblioteca/acciones", () => ({ ocultarIdeaAccion }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace }) }))

import { AvisoDeIdeas } from "@/app/(app)/biblioteca/aviso-de-ideas"
import { BotonOcultar } from "@/app/(app)/biblioteca/boton-ocultar"
import { ListaDeIdeas } from "@/app/(app)/biblioteca/lista-de-ideas"
import { ID_DEL_AVISO_DE_IDEAS, idDeIdea } from "@/lib/dominio/biblioteca/ideas"

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

/** The page's always-mounted note, which survives the redraw that unmounts the button. */
function conAviso() {
  const aviso = document.createElement("div")
  aviso.id = ID_DEL_AVISO_DE_IDEAS
  aviso.tabIndex = -1
  document.body.append(aviso)
  return aviso
}

describe("BotonOcultar", () => {
  it("Ocultar hides the idea, moves focus to the page's note and goes to the address after hiding (D6)", async () => {
    const aviso = conAviso()
    render(<BotonOcultar ideaId={ID} oculta={false} despues={`/biblioteca/temas/t?oculta=${ID}`} />)
    fireEvent.click(screen.getByRole("button", { name: "Ocultar" }))
    await waitFor(() => expect(ocultarIdeaAccion).toHaveBeenCalledWith({ id: ID, oculta: true }))
    await waitFor(() => expect(replace).toHaveBeenCalledWith(`/biblioteca/temas/t?oculta=${ID}`, { scroll: false }))
    expect(aviso).toHaveFocus()
    aviso.remove()
  })

  it("Mostrar shows it again, moves focus to the page's note and goes to the address after showing", async () => {
    const aviso = conAviso()
    render(<BotonOcultar ideaId={ID} oculta despues={`/biblioteca/autores/a?mostrada=${ID}`} />)
    fireEvent.click(screen.getByRole("button", { name: "Mostrar" }))
    await waitFor(() => expect(ocultarIdeaAccion).toHaveBeenCalledWith({ id: ID, oculta: false }))
    await waitFor(() => expect(replace).toHaveBeenCalledWith(`/biblioteca/autores/a?mostrada=${ID}`, { scroll: false }))
    expect(aviso).toHaveFocus()
    aviso.remove()
  })

  it("points at the idea's text, so many of them read apart", () => {
    render(<BotonOcultar ideaId={ID} oculta={false} despues="/biblioteca/temas" />)
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

describe("AvisoDeIdeas", () => {
  it("is always there, focusable and live, and says the note only when there is one", () => {
    const { rerender } = render(<AvisoDeIdeas texto={null} />)
    const aviso = document.getElementById(ID_DEL_AVISO_DE_IDEAS)
    expect(aviso).toHaveAttribute("aria-live", "polite")
    expect(aviso).toHaveAttribute("tabindex", "-1")
    expect(aviso).toBeEmptyDOMElement()
    rerender(<AvisoDeIdeas texto="La volví a mostrar. Está en Sin tema todavía." />)
    expect(document.getElementById(ID_DEL_AVISO_DE_IDEAS)).toBe(aviso)
    expect(aviso).toHaveTextContent("La volví a mostrar. Está en Sin tema todavía.")
  })
})
