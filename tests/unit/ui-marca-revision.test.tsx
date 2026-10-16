import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { MarcaRevision } from "@/components/ui/marca-revision"
import type { Hallazgo } from "@/lib/dominio/revision"

const CON_FRASE: Hallazgo = {
  regla: "cifra_sin_verificar",
  tipo: "advierte",
  mensaje: "El informe dice «muchas», no «la mayoría».",
  frase: "la mayoría de estas apps",
}
const SIN_FRASE: Hallazgo = { regla: "tema_de_riesgo", tipo: "advierte", mensaje: "El tema es sexualidad." }
const BLOQUEA: Hallazgo = { regla: "cierre", tipo: "bloquea", mensaje: "Falta el cierre." }

describe("MarcaRevision", () => {
  it("asks her to look at the marked phrase and tick 'Lo revisé y está bien'", () => {
    const alCambiar = vi.fn()
    render(<MarcaRevision hallazgo={CON_FRASE} confirmada={false} alCambiar={alCambiar} fraseResaltada />)
    expect(screen.getByText("Revisa la frase marcada")).toBeInTheDocument()
    expect(screen.getByText("El informe dice «muchas», no «la mayoría».")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("checkbox", { name: "Lo revisé y está bien" }))
    expect(alCambiar).toHaveBeenCalledWith(true)
  })

  it("quotes the phrase only when the script above could not mark it", () => {
    const { rerender } = render(
      <MarcaRevision hallazgo={CON_FRASE} confirmada={false} alCambiar={vi.fn()} fraseResaltada />,
    )
    expect(screen.queryByText("la mayoría de estas apps")).toBeNull()
    rerender(<MarcaRevision hallazgo={CON_FRASE} confirmada={false} alCambiar={vi.fn()} />)
    expect(screen.getByText("la mayoría de estas apps").tagName.toLowerCase()).toBe("q")
  })

  it("says the point is reviewed once she ticks it", () => {
    const { rerender } = render(<MarcaRevision hallazgo={CON_FRASE} confirmada alCambiar={vi.fn()} />)
    expect(screen.getByText("Frase revisada")).toBeInTheDocument()
    rerender(<MarcaRevision hallazgo={SIN_FRASE} confirmada alCambiar={vi.fn()} />)
    expect(screen.getByText("Revisado")).toBeInTheDocument()
    rerender(<MarcaRevision hallazgo={SIN_FRASE} confirmada={false} alCambiar={vi.fn()} />)
    expect(screen.getByText("Revisa este punto")).toBeInTheDocument()
  })

  it("is a flat panel with a 1 px campo border and no side rule, with the id the marked phrase links to", () => {
    render(<MarcaRevision id="revision-0" hallazgo={CON_FRASE} confirmada={false} alCambiar={vi.fn()} />)
    const panel = screen.getByRole("region", { name: "Revisa la frase marcada" })
    expect(panel).toHaveAttribute("id", "revision-0")
    expect(panel).toHaveClass("bg-piedra-alta", "border", "border-campo", "rounded-panel")
    expect(panel.className).not.toMatch(/shadow-|border-l-/)
  })

  it("has no tick on a blocking finding: an error block that says it has to be fixed", () => {
    render(<MarcaRevision hallazgo={BLOQUEA} confirmada={false} alCambiar={vi.fn()} />)
    expect(screen.queryByRole("checkbox")).toBeNull()
    expect(screen.getByRole("alert")).toHaveTextContent("Hay que corregirlo")
    expect(screen.getByText("Hay que corregirlo")).toHaveClass("text-error")
    expect(screen.getByText("Sin esto no puedes firmar.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Editar el guion" })).toBeNull()
  })

  it("offers to open the editor on a blocking finding at gate 1", () => {
    const alEditar = vi.fn()
    render(<MarcaRevision hallazgo={BLOQUEA} confirmada={false} alCambiar={vi.fn()} alEditar={alEditar} />)
    fireEvent.click(screen.getByRole("button", { name: "Editar el guion" }))
    expect(alEditar).toHaveBeenCalledTimes(1)
  })

  it("does not interrupt again for a blocking finding the screen already announced", () => {
    render(<MarcaRevision hallazgo={BLOQUEA} confirmada={false} alCambiar={vi.fn()} anunciada />)
    expect(screen.queryByRole("alert")).toBeNull()
  })
})
