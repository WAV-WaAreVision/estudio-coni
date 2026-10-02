import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { EditorDeGuion } from "@/components/editor-de-guion"

const { editar, volver } = vi.hoisted(() => ({ editar: vi.fn(), volver: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock("@/app/(app)/piezas/acciones", () => ({ editarGuionAccion: editar, volverAVersionDeClaudeAccion: volver }))

const GUION = "Hola, hoy hablamos del deseo."
const TEXTO = "Un texto para Instagram. Avatar digital."

function montar(extra: Partial<Parameters<typeof EditorDeGuion>[0]> = {}) {
  const props = {
    piezaId: "pieza-1",
    version: 3,
    guion: GUION,
    texto: TEXTO,
    tieneVersionDeClaude: false,
    alGuardar: vi.fn(),
    alCambiarSinGuardar: vi.fn(),
    ...extra,
  }
  return { props, ...render(<EditorDeGuion {...props} />) }
}

const cajaGuion = () => screen.getByRole("textbox", { name: "Guion" })
const cajaTexto = () => screen.getByRole("textbox", { name: "Texto de la publicación" })
const guardar = () => screen.getByRole("button", { name: /Guardar cambios|Guardando…/ })

describe("EditorDeGuion", () => {
  beforeEach(() => {
    editar.mockReset()
    volver.mockReset()
  })

  it("shows both texts prefilled in labelled boxes with their length limits", () => {
    montar()

    expect(cajaGuion()).toHaveValue(GUION)
    expect(cajaTexto()).toHaveValue(TEXTO)
    expect(cajaGuion()).toHaveAttribute("maxlength", "2000")
    expect(cajaTexto()).toHaveAttribute("maxlength", "2200")
  })

  it("updates the words, the seconds and the state as she types", () => {
    montar()
    const contador = screen.getByText(/palabras · ≈/)
    expect(contador.closest("[aria-live]")).toHaveAttribute("aria-live", "polite")
    expect(contador).toHaveTextContent("5 palabras · ≈ 2 s")
    expect(screen.getByText("Un poco corto")).toBeInTheDocument()

    fireEvent.change(cajaGuion(), { target: { value: Array.from({ length: 110 }, () => "hola").join(" ") } })

    expect(screen.getByText(/palabras · ≈/)).toHaveTextContent("110 palabras")
    expect(screen.getByText("Bien")).toBeInTheDocument()

    fireEvent.change(cajaGuion(), { target: { value: Array.from({ length: 400 }, () => "hola").join(" ") } })
    expect(screen.getByText("Un poco largo")).toBeInTheDocument()
  })

  it("keeps save disabled until something changed and reports unsaved changes", () => {
    const { props } = montar()
    expect(guardar()).toHaveAttribute("aria-disabled", "true")

    fireEvent.change(cajaTexto(), { target: { value: `${TEXTO} Más.` } })

    expect(guardar()).not.toHaveAttribute("aria-disabled")
    expect(props.alCambiarSinGuardar).toHaveBeenLastCalledWith(true)
  })

  it("saves both texts for the version she saw, then says Guardado and hands over the new version", async () => {
    const pedido = Promise.withResolvers<unknown>()
    editar.mockReturnValue(pedido.promise)
    const { props } = montar()
    fireEvent.change(cajaGuion(), { target: { value: "Hola, otro guion." } })

    fireEvent.click(guardar())

    expect(await screen.findByRole("button", { name: "Guardando…" })).toBeInTheDocument()
    expect(editar).toHaveBeenCalledWith("pieza-1", 3, "Hola, otro guion.", TEXTO)
    await act(async () => pedido.resolve({ ok: true, version: 4, revision: [] }))
    expect(await screen.findByText("Guardado")).toBeInTheDocument()
    expect(props.alGuardar).toHaveBeenCalledWith({ version: 4, revision: [] })
    expect(props.alCambiarSinGuardar).toHaveBeenLastCalledWith(false)
    expect(guardar()).toHaveAttribute("aria-disabled", "true")
  })

  it("tells her how many observations the review left after saving", async () => {
    editar.mockResolvedValue({
      ok: true,
      version: 4,
      revision: [{ regla: "numeros", tipo: "advierte", mensaje: "Escribe los números con palabras." }],
    })
    montar()
    fireEvent.change(cajaGuion(), { target: { value: "Hola 3." } })

    fireEvent.click(guardar())

    expect(await screen.findByText("Guardado")).toBeInTheDocument()
    expect(screen.getByText(/1 observación para confirmar/)).toBeInTheDocument()
  })

  it("shows the es-CL error in an alert when saving fails", async () => {
    editar.mockResolvedValue({ ok: false, error: "Este guion ya no se puede editar." })
    montar()
    fireEvent.change(cajaGuion(), { target: { value: "Hola." } })

    fireEvent.click(guardar())

    expect(await screen.findByRole("alert")).toHaveTextContent("Este guion ya no se puede editar.")
    expect(screen.queryByText("Guardado")).not.toBeInTheDocument()
  })

  it("shows the blocking findings when the review refuses the edit", async () => {
    editar.mockResolvedValue({
      ok: false,
      motivo: "revision_bloquea",
      error: "Todavía no se puede guardar así: la revisión tiene algo que corregir.",
      hallazgos: [{ regla: "aviso_avatar", tipo: "bloquea", mensaje: "El texto tiene que avisar que es un avatar." }],
    })
    montar()
    fireEvent.change(cajaTexto(), { target: { value: "Sin aviso." } })

    fireEvent.click(guardar())

    expect(await screen.findByText("El texto tiene que avisar que es un avatar.")).toBeInTheDocument()
    expect(screen.getByRole("alert")).toHaveTextContent("la revisión tiene algo que corregir")
  })

  it("clears the refusal as soon as she changes the box again", async () => {
    editar.mockResolvedValue({
      ok: false,
      motivo: "revision_bloquea",
      error: "Todavía no se puede guardar así.",
      hallazgos: [{ regla: "aviso_avatar", tipo: "bloquea", mensaje: "Falta el aviso del avatar." }],
    })
    montar()
    fireEvent.change(cajaTexto(), { target: { value: "Sin aviso." } })
    fireEvent.click(guardar())
    expect(await screen.findByText("Falta el aviso del avatar.")).toBeInTheDocument()

    fireEvent.change(cajaTexto(), { target: { value: "Sin aviso. Avatar digital." } })

    expect(screen.queryByText("Falta el aviso del avatar.")).not.toBeInTheDocument()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  it("offers going back to Claude's version only when there is one", () => {
    const { unmount } = montar()
    expect(screen.queryByRole("button", { name: "Volver a la versión de Claude" })).not.toBeInTheDocument()
    unmount()

    montar({ tieneVersionDeClaude: true })
    expect(screen.getByRole("button", { name: "Volver a la versión de Claude" })).toBeInTheDocument()
  })

  it("asks in the page before restoring and cancels without calling the server", () => {
    montar({ tieneVersionDeClaude: true })

    fireEvent.click(screen.getByRole("button", { name: "Volver a la versión de Claude" }))
    expect(
      screen.getByText("¿Volver al guion que escribió Claude? Se guarda como una versión nueva."),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }))

    expect(volver).not.toHaveBeenCalled()
    expect(screen.queryByText(/¿Volver al guion/)).not.toBeInTheDocument()
  })

  it("restores Claude's version after confirming and takes the new texts from the screen", async () => {
    volver.mockResolvedValue({ ok: true, version: 5, revision: [] })
    const { props, rerender } = montar({ tieneVersionDeClaude: true })
    fireEvent.change(cajaGuion(), { target: { value: "Mi versión." } })

    fireEvent.click(screen.getByRole("button", { name: "Volver a la versión de Claude" }))
    fireEvent.click(screen.getByRole("button", { name: "Sí, volver" }))

    await waitFor(() => expect(volver).toHaveBeenCalledWith("pieza-1", 3))
    expect(await screen.findByText("Guardado")).toBeInTheDocument()
    expect(props.alGuardar).toHaveBeenCalledWith({ version: 5, revision: [] })

    rerender(<EditorDeGuion {...props} version={5} guion="El guion de Claude." texto="Texto de Claude." />)
    expect(cajaGuion()).toHaveValue("El guion de Claude.")
    expect(cajaTexto()).toHaveValue("Texto de Claude.")
    expect(guardar()).toHaveAttribute("aria-disabled", "true")
  })
})
