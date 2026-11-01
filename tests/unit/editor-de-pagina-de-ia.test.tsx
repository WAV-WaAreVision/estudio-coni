import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { EditorDePaginaDeIa, type VersionParaMostrar } from "@/app/(app)/ajustes/pagina-de-ia/editor-de-pagina-de-ia"
import type { Resultado } from "@/lib/acciones/resultado"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

const copiar = vi.fn(async (_texto: string) => {})
Object.defineProperty(navigator, "clipboard", { value: { writeText: copiar }, configurable: true })

const BORRADOR = Array.from({ length: 8 }, () => "Uso IA para preparar mi contenido y te cuento cómo lo hago.").join(
  " ",
)
const LINEA = "Cómo uso IA en mi contenido: conidolly.vercel.app/l/ia"
const VIGENTE: VersionParaMostrar = {
  version: 2,
  fecha: "3 de noviembre de 2026",
  motivo: "Agrego las imágenes",
  texto: `${BORRADOR} Dos.`,
  vigente: true,
}
const PRIMERA: VersionParaMostrar = {
  version: 1,
  fecha: "2 de noviembre de 2026",
  motivo: "Primera versión",
  texto: `${BORRADOR} Uno.`,
  vigente: false,
}

type Publicar = (texto: string, motivo: string) => Promise<Resultado<{ version: number }>>
type VolverA = (version: number) => Promise<Resultado<{ version: number }>>

function antesDePublicar(publicar: Publicar = async () => ({ ok: true, version: 1 })) {
  const accion = vi.fn<Publicar>(publicar)
  render(
    <EditorDePaginaDeIa
      publicada={null}
      inicial={BORRADOR}
      esPropuesta
      historial={[]}
      lineaParaLaBio={LINEA}
      publicar={accion}
      volverA={vi.fn<VolverA>()}
    />,
  )
  return accion
}

function conVersiones(volverA: VolverA = async () => ({ ok: true, version: 3 })) {
  const accion = vi.fn<VolverA>(volverA)
  render(
    <EditorDePaginaDeIa
      publicada={{ texto: VIGENTE.texto, fecha: VIGENTE.fecha }}
      inicial={VIGENTE.texto}
      esPropuesta={false}
      historial={[VIGENTE, PRIMERA]}
      lineaParaLaBio={LINEA}
      publicar={vi.fn<Publicar>()}
      volverA={accion}
    />,
  )
  return accion
}

const editor = () => screen.getByLabelText<HTMLTextAreaElement>("Texto de la página")

describe("EditorDePaginaDeIa", () => {
  it("starts from WAV's draft, says it is a proposal and that nothing is published yet", () => {
    antesDePublicar()

    expect(screen.getByText("Propuesta de WAV")).toBeInTheDocument()
    expect(screen.getByText("Todavía no la publicas")).toBeInTheDocument()
    expect(editor().value).toBe(BORRADOR)
    expect(screen.queryByRole("heading", { name: "Versiones" })).toBeNull()
  })

  it("publishes the text with its reason and says which version it is", async () => {
    const publicar = antesDePublicar()

    fireEvent.change(screen.getByLabelText("¿Por qué lo cambias?"), { target: { value: "Primera versión" } })
    fireEvent.click(screen.getByRole("button", { name: "Publicar" }))

    expect(await screen.findByText("Publicaste la versión 1.")).toBeInTheDocument()
    expect(publicar).toHaveBeenCalledWith(BORRADOR, "Primera versión")
  })

  it("keeps her text in the editor and says why when publishing fails", async () => {
    antesDePublicar(async () => ({
      ok: false,
      error: "Algo falló de nuestro lado. Inténtalo de nuevo en unos minutos.",
    }))

    fireEvent.change(editor(), { target: { value: `${BORRADOR} Cambio mío.` } })
    fireEvent.change(screen.getByLabelText("¿Por qué lo cambias?"), { target: { value: "Lo dejo a mi manera" } })
    fireEvent.click(screen.getByRole("button", { name: "Publicar" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Algo falló de nuestro lado.")
    expect(editor().value).toBe(`${BORRADOR} Cambio mío.`)
  })

  it("does not publish a text under 300 characters or without a reason", () => {
    const publicar = antesDePublicar()
    const boton = screen.getByRole("button", { name: "Publicar" })

    expect(boton).toHaveAttribute("aria-disabled", "true")
    fireEvent.change(screen.getByLabelText("¿Por qué lo cambias?"), { target: { value: "Prueba" } })
    fireEvent.change(editor(), { target: { value: "Corto." } })
    expect(screen.getByText("6 de 6.000 caracteres · mínimo 300")).toBeInTheDocument()
    fireEvent.click(boton)

    expect(boton).toHaveAttribute("aria-disabled", "true")
    expect(publicar).not.toHaveBeenCalled()
  })

  it("lists the versions and goes back to an earlier one, loading its text", async () => {
    const volverA = conVersiones()

    expect(screen.getByText("Es la que se ve hoy.")).toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: "Volver a esta" })).toHaveLength(1)
    fireEvent.click(screen.getByRole("button", { name: "Volver a esta" }))

    expect(await screen.findByText("Volviste al texto de la versión 1: ahora es la versión 3.")).toBeInTheDocument()
    expect(volverA).toHaveBeenCalledWith(1)
    await waitFor(() => expect(editor().value).toBe(PRIMERA.texto))
  })

  it("says why Publicar is not ready and links the reason and the counter", () => {
    antesDePublicar()
    const boton = screen.getByRole("button", { name: "Publicar" })

    expect(boton).toHaveAccessibleDescription("Escribe por qué lo cambias para poder publicar.")
    fireEvent.change(editor(), { target: { value: "Corto." } })
    expect(boton).toHaveAccessibleDescription("El texto tiene que tener entre 300 y 6.000 caracteres.")
    expect(editor()).toHaveAccessibleDescription("6 de 6.000 caracteres · mínimo 300")

    fireEvent.change(editor(), { target: { value: BORRADOR } })
    fireEvent.change(screen.getByLabelText("¿Por qué lo cambias?"), { target: { value: "Primera versión" } })
    expect(boton).not.toHaveAttribute("aria-disabled")
    expect(boton).not.toHaveAttribute("aria-describedby")
  })

  it("shows a failed going back next to the versions and leaves the editor text alone", async () => {
    conVersiones(async () => ({ ok: false, error: "Esa versión ya no está." }))
    fireEvent.change(editor(), { target: { value: `${VIGENTE.texto} Mío.` } })

    fireEvent.click(screen.getByRole("button", { name: "Volver a esta" }))

    const alerta = await screen.findByRole("alert")
    expect(alerta).toHaveTextContent("Esa versión ya no está.")
    const versiones = screen.getByRole("region", { name: "Versiones" })
    expect(versiones).toContainElement(alerta)
    expect(editor().value).toBe(`${VIGENTE.texto} Mío.`)
  })

  it("shows the going back confirmation next to the versions, not in the form", async () => {
    conVersiones()

    fireEvent.click(screen.getByRole("button", { name: "Volver a esta" }))

    const aviso = await screen.findByText("Volviste al texto de la versión 1: ahora es la versión 3.")
    expect(screen.getByRole("region", { name: "Versiones" })).toContainElement(aviso)
  })

  it("disables every action while one is pending", async () => {
    let terminar: (r: Resultado<{ version: number }>) => void = () => {}
    const volverA = conVersiones(
      () =>
        new Promise((r) => {
          terminar = r
        }),
    )
    fireEvent.change(screen.getByLabelText("¿Por qué lo cambias?"), { target: { value: "Prueba" } })

    fireEvent.click(screen.getByRole("button", { name: "Volver a esta" }))

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Publicar" })).toHaveAttribute("aria-disabled", "true"),
    )
    fireEvent.click(screen.getByRole("button", { name: "Volver a esta" }))
    expect(volverA).toHaveBeenCalledTimes(1)
    terminar({ ok: true, version: 3 })
    await screen.findByText("Volviste al texto de la versión 1: ahora es la versión 3.")
  })

  it("copies the line for her bios", async () => {
    antesDePublicar()

    expect(screen.getByText(LINEA)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Copiar la línea" }))

    expect(await screen.findByText("Línea copiada")).toBeInTheDocument()
    expect(copiar).toHaveBeenCalledWith(LINEA)
  })
})
