import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { TextoLinkedin } from "@/app/(app)/video/[id]/texto-linkedin"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))

const TEXTO = "Llevan diez años juntos.\n\n¿En qué momento te cuesta desconectarte?"

function armar(sobre: Partial<Parameters<typeof TextoLinkedin>[0]> = {}) {
  const alGuardar = vi.fn().mockResolvedValue({ ok: true })
  render(<TextoLinkedin piezaId="p1" version={4} texto={TEXTO} guardado alGuardar={alGuardar} {...sobre} />)
  return { alGuardar }
}

describe("TextoLinkedin", () => {
  it("shows the saved text as it will be published, with its length", () => {
    armar()
    expect(screen.getByText(/Llevan diez años juntos/)).toBeInTheDocument()
    expect(screen.getByText(`${[...TEXTO].length} de 3.000`)).toBeInTheDocument()
  })

  it("edits the text and saves it for this piece and this version, then goes back to reading", async () => {
    const { alGuardar } = armar()

    fireEvent.click(screen.getByRole("button", { name: "Editar el texto para LinkedIn" }))
    fireEvent.change(screen.getByLabelText("Texto de la publicación en LinkedIn"), {
      target: { value: "Texto nuevo." },
    })
    fireEvent.click(screen.getByRole("button", { name: "Guardar el texto para LinkedIn" }))

    await waitFor(() => expect(alGuardar).toHaveBeenCalledWith("p1", 4, "Texto nuevo."))
    await waitFor(() => expect(screen.queryByLabelText("Texto de la publicación en LinkedIn")).not.toBeInTheDocument())
  })

  it("cancels the edit without saving", () => {
    const { alGuardar } = armar()

    fireEvent.click(screen.getByRole("button", { name: "Editar el texto para LinkedIn" }))
    fireEvent.change(screen.getByLabelText("Texto de la publicación en LinkedIn"), { target: { value: "Otro." } })
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }))

    expect(alGuardar).not.toHaveBeenCalled()
    expect(screen.getByText(/Llevan diez años juntos/)).toBeInTheDocument()
  })

  it("shows the error the action answers and keeps the editor open with her text", async () => {
    const alGuardar = vi.fn().mockResolvedValue({ ok: false, error: "Esta pieza cambió mientras la mirabas." })
    armar({ alGuardar })

    fireEvent.click(screen.getByRole("button", { name: "Editar el texto para LinkedIn" }))
    fireEvent.change(screen.getByLabelText("Texto de la publicación en LinkedIn"), { target: { value: "Mi cambio." } })
    fireEvent.click(screen.getByRole("button", { name: "Guardar el texto para LinkedIn" }))

    expect(await screen.findByText("Esta pieza cambió mientras la mirabas.")).toBeInTheDocument()
    expect(screen.getByLabelText("Texto de la publicación en LinkedIn")).toHaveValue("Mi cambio.")
  })

  it("blocks saving a text over 3000 characters or empty, and says it with the count", () => {
    armar()
    fireEvent.click(screen.getByRole("button", { name: "Editar el texto para LinkedIn" }))
    const campo = screen.getByLabelText("Texto de la publicación en LinkedIn")

    fireEvent.change(campo, { target: { value: "a".repeat(3001) } })
    expect(screen.getByText("3.001 de 3.000")).toHaveClass("text-error")
    expect(screen.getByRole("button", { name: "Guardar el texto para LinkedIn" })).toHaveAttribute(
      "aria-disabled",
      "true",
    )

    fireEvent.change(campo, { target: { value: "" } })
    expect(screen.getByRole("button", { name: "Guardar el texto para LinkedIn" })).toHaveAttribute(
      "aria-disabled",
      "true",
    )
  })

  it("does not offer to edit when the text cannot be edited any more", () => {
    armar({ editable: false })
    expect(screen.queryByRole("button", { name: "Editar el texto para LinkedIn" })).not.toBeInTheDocument()
  })

  describe("a piece from before LinkedIn", () => {
    it("opens the editor with the starting text and asks her to review and save it before approving", () => {
      armar({ guardado: false, texto: "Hola.\n\nEste video lo narra mi avatar digital." })

      expect(screen.getByLabelText("Texto de la publicación en LinkedIn")).toHaveValue(
        "Hola.\n\nEste video lo narra mi avatar digital.",
      )
      expect(screen.getByText(/Parte del texto de Instagram/)).toBeInTheDocument()
      expect(screen.getByRole("button", { name: "Guardar el texto para LinkedIn" })).toBeInTheDocument()
      expect(screen.queryByRole("button", { name: "Cancelar" })).not.toBeInTheDocument()
    })

    it("saves the starting text as it is when she accepts it", async () => {
      const { alGuardar } = armar({ guardado: false, texto: "Hola." })

      fireEvent.click(screen.getByRole("button", { name: "Guardar el texto para LinkedIn" }))

      await waitFor(() => expect(alGuardar).toHaveBeenCalledWith("p1", 4, "Hola."))
    })
  })
})
