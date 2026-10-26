import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { type DatosDeCarrusel, PantallaCarrusel } from "@/app/(app)/guion/[id]/pantalla-carrusel"
import { FUENTE_DEL_CARRUSEL, LAMINAS_DE_PRUEBA, TEXTO_POST_DE_PRUEBA } from "../fixtures/carrusel"

const { firmar, pedir, redibujar } = vi.hoisted(() => ({ firmar: vi.fn(), pedir: vi.fn(), redibujar: vi.fn() }))
// A `router.refresh()` loses the race with the address's prefetches (`useRedibujar`): the screen redraws by its address.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: redibujar }) }))
vi.mock("@/app/(app)/piezas/acciones", () => ({ firmarCarruselAccion: firmar, pedirCambioDeCarruselAccion: pedir }))

const DATOS: DatosDeCarrusel = {
  id: "p1",
  version: 4,
  titulo: "Lo que un chatbot no ve de ti",
  pilar: null,
  laminas: LAMINAS_DE_PRUEBA,
  textoPost: TEXTO_POST_DE_PRUEBA,
  revision: [],
  cambiosQuedan: 3,
}
const AVISO = {
  regla: "largo_lamina" as const,
  tipo: "advierte" as const,
  mensaje: "La lámina 2 tiene 230 caracteres. Cabe bien hasta 220.",
}
const BLOQUEO = {
  regla: "mencion_avatar" as const,
  tipo: "bloquea" as const,
  mensaje: "Quita la mención.",
  frase: "avatar",
}

const montar = (cambios: Partial<DatosDeCarrusel> = {}) => render(<PantallaCarrusel datos={{ ...DATOS, ...cambios }} />)
const deslizador = () => screen.getByRole("slider", { name: "Desliza para firmar" })

beforeEach(() => {
  firmar.mockReset().mockResolvedValue({ ok: true, version: 5 })
  pedir.mockReset().mockResolvedValue({ ok: true })
  redibujar.mockReset()
})

describe("PantallaCarrusel", () => {
  it("lists the slides by number and kind, the source on the last one, and the post text", () => {
    montar()
    expect(screen.getByRole("heading", { name: "1. Revisa las láminas" })).toBeInTheDocument()
    expect(screen.getByText("Lámina 1 · Portada")).toBeInTheDocument()
    expect(screen.getByText("Lámina 6 · Cierre")).toBeInTheDocument()
    // Within the list: the cover repeats the title.
    const laminas = within(screen.getByRole("list"))
    for (const lamina of LAMINAS_DE_PRUEBA) expect(laminas.getByText(lamina.texto)).toBeInTheDocument()
    expect(screen.getByText(FUENTE_DEL_CARRUSEL)).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "2. Revisa el texto de la publicación" })).toBeInTheDocument()
    expect(screen.getByText(/Constanza del Rosario$/)).toBeInTheDocument()
    expect(screen.getByText("Revisé el carrusel y no encontré observaciones. Tú decides.")).toBeInTheDocument()
    expect(screen.getByText("Firmas las láminas y el texto. Todavía no se publica nada.")).toBeInTheDocument()
  })

  it("signs the version she sees and refreshes into the waiting screen", async () => {
    montar()
    fireEvent.keyDown(deslizador(), { key: "Enter" })
    await waitFor(() => expect(firmar).toHaveBeenCalledWith("p1", 4))
    await waitFor(() => expect(redibujar).toHaveBeenCalledWith(expect.stringMatching(/\?v=\d+$/), { scroll: false }))
  })

  it("keeps the signature closed until each warning is ticked", () => {
    montar({ revision: [AVISO] })
    expect(deslizador()).toHaveAttribute("aria-disabled", "true")
    expect(screen.getByText(/revisar 1 aviso/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("checkbox", { name: "Lo revisé y está bien" }))
    expect(deslizador()).toHaveAttribute("aria-disabled", "false")
  })

  it("asks for a change, opened, when the review blocks", () => {
    montar({ revision: [BLOQUEO] })
    expect(deslizador()).toHaveAttribute("aria-disabled", "true")
    expect(screen.getByText(/pedir un cambio/)).toBeInTheDocument()
    expect(screen.getByLabelText("¿Qué quieres cambiar?")).toBeVisible()
  })

  it("sends her sentence with the version she read and says how many are left", async () => {
    montar({ cambiosQuedan: 2 })
    fireEvent.click(screen.getByText("Pedir cambio"))
    expect(screen.getByText(/Te quedan 2 cambios\./)).toBeInTheDocument()
    const boton = screen.getByRole("button", { name: "Pedir este cambio" })
    // `Boton deshabilitado` stays focusable and says so with aria-disabled.
    expect(boton).toHaveAttribute("aria-disabled", "true")
    fireEvent.change(screen.getByLabelText("¿Qué quieres cambiar?"), { target: { value: "Más corto" } })
    fireEvent.click(boton)
    await waitFor(() => expect(pedir).toHaveBeenCalledWith("p1", 4, "Más corto"))
    await waitFor(() => expect(redibujar).toHaveBeenCalled())
  })

  it("offers no more changes after three", () => {
    montar({ cambiosQuedan: 0 })
    fireEvent.click(screen.getByText("Pedir cambio"))
    expect(screen.getByText("Ya pediste 3 cambios. Puedes firmarlo como está.")).toBeInTheDocument()
    expect(screen.queryByLabelText("¿Qué quieres cambiar?")).not.toBeInTheDocument()
  })

  it("shows the action's error above the signature", async () => {
    firmar.mockResolvedValue({
      ok: false,
      error: "Esto cambió mientras lo revisabas y no quedó aprobado. Vuelve a revisarlo.",
    })
    montar()
    fireEvent.keyDown(deslizador(), { key: "Enter" })
    expect(
      await screen.findByText("Esto cambió mientras lo revisabas y no quedó aprobado. Vuelve a revisarlo."),
    ).toBeInTheDocument()
  })
})
