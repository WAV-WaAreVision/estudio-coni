import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

type Respuesta = { ok: true } | { ok: false; error: string }

const { acciones } = vi.hoisted(() => ({
  acciones: {
    corregirEtiquetaAccion: vi.fn(async (..._: unknown[]): Promise<Respuesta> => ({ ok: true })),
    confirmarEtiquetaAccion: vi.fn(async (..._: unknown[]): Promise<Respuesta> => ({ ok: true })),
    quitarMarcaAccion: vi.fn(async (..._: unknown[]): Promise<Respuesta> => ({ ok: true })),
  },
}))
vi.mock("@/app/(app)/biblioteca/acciones", () => acciones)
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }))

import { EditorDeEtiqueta } from "@/app/(app)/biblioteca/afirmaciones/[id]/editor-de-etiqueta"
import { TarjetaDeEtiquetaDudosa } from "@/app/(app)/biblioteca/etiquetas/revisar/tarjeta-de-etiqueta"
import { type ItemDeLote, type TarjetaDeEtiqueta, tarjetaDeItem } from "@/lib/dominio/biblioteca/lote-de-etiquetas"
import {
  afirmacionDePrueba,
  CATALOGO_DE_PRUEBA,
  ID_DE_AFIRMACION,
  MARCA_EMOCION_LINKEDIN,
  marcaDePrueba,
} from "../fixtures/afirmaciones"

const item = (extra: Partial<ItemDeLote> = {}): ItemDeLote => ({
  posicion: 1,
  afirmacionId: ID_DE_AFIRMACION,
  campo: "emocion",
  red: "linkedin",
  marcaId: MARCA_EMOCION_LINKEDIN,
  motivo: "certeza_baja",
  hecha: false,
  ...extra,
})

function tarjeta(extra: Partial<ItemDeLote> = {}, afirmacion = afirmacionDePrueba()): TarjetaDeEtiqueta {
  const resultado = tarjetaDeItem(item(extra), afirmacion, CATALOGO_DE_PRUEBA)
  if (!resultado) throw new Error("La prueba esperaba una tarjeta")
  return resultado
}

function hecha(accion: "confirma" | "corrige"): TarjetaDeEtiqueta {
  return tarjeta(
    { hecha: true },
    afirmacionDePrueba({
      marcas: [marcaDePrueba({ origen: "coni", certeza: "alta" })],
      correcciones: [
        {
          campo: "emocion",
          red: "linkedin",
          accion,
          marcaId: MARCA_EMOCION_LINKEDIN,
          creadaEn: "2026-11-26T10:00:00+00:00",
        },
      ],
    }),
  )
}

beforeEach(() => vi.clearAllMocks())

describe("TarjetaDeEtiquetaDudosa", () => {
  it("shows the claim, its author, the tag with its phrase and why it is here, and links to the claim", () => {
    render(<TarjetaDeEtiquetaDudosa tarjeta={tarjeta()} />)
    const carta = screen.getByRole("article", { name: "Emoción en LinkedIn" })
    expect(carta).toHaveTextContent("«El aislamiento pesa más que las horas extra.»")
    expect(carta).toHaveTextContent("Daniela Ruiz")
    expect(carta).toHaveTextContent("Escepticismo")
    expect(carta).toHaveTextContent("«No me lo creo»")
    expect(carta).toHaveTextContent("Claude no estaba segura")
    expect(within(carta).getByRole("link", { name: "Ver la afirmación" })).toHaveAttribute(
      "href",
      `/biblioteca/afirmaciones/${ID_DE_AFIRMACION}?desde=%2Fbiblioteca%2Fetiquetas%2Frevisar`,
    )
  })

  it("«Está bien» confirms that mark's row", async () => {
    render(<TarjetaDeEtiquetaDudosa tarjeta={tarjeta()} />)
    fireEvent.click(screen.getByRole("button", { name: "Está bien" }))
    await waitFor(() =>
      expect(acciones.confirmarEtiquetaAccion).toHaveBeenCalledWith({
        afirmacionId: ID_DE_AFIRMACION,
        campo: "emocion",
        red: "linkedin",
        marcaId: MARCA_EMOCION_LINKEDIN,
      }),
    )
  })

  it("«Cambiar» opens the tag's list and sends the new value with the mark's row", async () => {
    render(<TarjetaDeEtiquetaDudosa tarjeta={tarjeta()} />)
    fireEvent.click(screen.getByRole("button", { name: "Cambiar" }))
    fireEvent.click(screen.getByRole("radio", { name: /Curiosidad/ }))
    fireEvent.click(screen.getByRole("button", { name: "Cambiar" }))
    await waitFor(() =>
      expect(acciones.corregirEtiquetaAccion).toHaveBeenCalledWith(
        expect.objectContaining({
          afirmacionId: ID_DE_AFIRMACION,
          campo: "emocion",
          red: "linkedin",
          marcaId: MARCA_EMOCION_LINKEDIN,
          valor: "curiosidad",
        }),
      ),
    )
  })

  it("«Cerrar» in the list puts back «Está bien» and «Cambiar»", () => {
    render(<TarjetaDeEtiquetaDudosa tarjeta={tarjeta()} />)
    fireEvent.click(screen.getByRole("button", { name: "Cambiar" }))
    expect(screen.queryByText("Claude no estaba segura")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }))
    expect(screen.getByRole("button", { name: "Está bien" })).toBeVisible()
    expect(screen.getByText("Claude no estaba segura")).toBeVisible()
  })

  it("«Cerrar» in the list gives the focus back to the card's «Cambiar»", async () => {
    render(<TarjetaDeEtiquetaDudosa tarjeta={tarjeta()} />)
    fireEvent.click(screen.getByRole("button", { name: "Cambiar" }))
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "Cambiar" })).toHaveFocus())
  })

  it("names the tag once while the list is open: the heading only for the reader, the editor shows the rest", () => {
    render(<TarjetaDeEtiquetaDudosa tarjeta={tarjeta()} />)
    fireEvent.click(screen.getByRole("button", { name: "Cambiar" }))
    expect(screen.getByRole("article", { name: "Emoción en LinkedIn" })).toBeVisible()
    expect(screen.getByRole("heading", { name: "Emoción en LinkedIn" })).toHaveClass("sr-only")
    // Only in the editor: its tag button and its list's choice.
    for (const texto of screen.getAllByText("Escepticismo")) expect(texto.closest("button, label")).not.toBeNull()
    expect(screen.getAllByText("«No me lo creo»")).toHaveLength(1)
  })

  it("after «Está bien», the card that comes back done takes the focus on its review line", async () => {
    const { rerender } = render(<TarjetaDeEtiquetaDudosa key="pendiente" tarjeta={tarjeta()} />)
    fireEvent.click(screen.getByRole("button", { name: "Está bien" }))
    await waitFor(() => expect(acciones.confirmarEtiquetaAccion).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByRole("button", { name: "Está bien" })).not.toBeDisabled())
    rerender(<TarjetaDeEtiquetaDudosa key="hecha" tarjeta={hecha("confirma")} />)
    await waitFor(() => expect(screen.getByText("Confirmada por ti")).toHaveFocus())
  })

  it("after a correction, the card that comes back done takes the focus on its review line", async () => {
    const { rerender } = render(<TarjetaDeEtiquetaDudosa key="pendiente" tarjeta={tarjeta()} />)
    fireEvent.click(screen.getByRole("button", { name: "Cambiar" }))
    fireEvent.click(screen.getByRole("radio", { name: /Curiosidad/ }))
    fireEvent.click(screen.getByRole("button", { name: "Cambiar" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "Está bien" })).toBeVisible())
    rerender(<TarjetaDeEtiquetaDudosa key="hecha" tarjeta={hecha("corrige")} />)
    await waitFor(() => expect(screen.getByText("Corregida por ti")).toHaveFocus())
  })

  it("closing the card's list leaves no focus for a later editor of the same tag to take on mount", () => {
    const { unmount } = render(<TarjetaDeEtiquetaDudosa tarjeta={tarjeta()} />)
    fireEvent.click(screen.getByRole("button", { name: "Cambiar" }))
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }))
    unmount()
    render(
      <EditorDeEtiqueta
        afirmacionId={ID_DE_AFIRMACION}
        campo="emocion"
        red="linkedin"
        marcaId={MARCA_EMOCION_LINKEDIN}
        titulo="Emoción en LinkedIn"
        actual={{
          valor: "escepticismo",
          etiqueta: "Escepticismo",
          frase: null,
          porQue: null,
          certezaBaja: false,
          revision: null,
        }}
        opciones={[]}
        conFrase
        quitable={false}
      />,
    )
    expect(screen.getByRole("button", { name: /Escepticismo/ })).not.toHaveFocus()
  })

  it("a card already done when the page opens does not take the focus", () => {
    render(<TarjetaDeEtiquetaDudosa tarjeta={hecha("confirma")} />)
    expect(screen.getByText("Confirmada por ti")).not.toHaveFocus()
  })

  it("offers only «Cambiar» for a tipo still sin_clasificar", () => {
    const sinClasificar = tarjeta(
      { campo: "tipo", red: "todas", marcaId: null, motivo: "sin_clasificar" },
      afirmacionDePrueba({ tipo: "sin_clasificar" }),
    )
    render(<TarjetaDeEtiquetaDudosa tarjeta={sinClasificar} />)
    expect(screen.queryByRole("button", { name: "Está bien" })).toBeNull()
    expect(screen.getByRole("button", { name: "Cambiar" })).toBeVisible()
    expect(screen.getByText("Quedó sin clasificar")).toBeVisible()
  })

  it("shows a done card with how it ended and no buttons", () => {
    const hecha = tarjeta(
      { hecha: true },
      afirmacionDePrueba({
        marcas: [marcaDePrueba({ origen: "coni", certeza: "alta" })],
        correcciones: [
          {
            campo: "emocion",
            red: "linkedin",
            accion: "confirma",
            marcaId: MARCA_EMOCION_LINKEDIN,
            creadaEn: "2026-11-26T10:00:00+00:00",
          },
        ],
      }),
    )
    render(<TarjetaDeEtiquetaDudosa tarjeta={hecha} />)
    expect(screen.getByText("Confirmada por ti")).toBeVisible()
    expect(screen.queryByRole("button")).toBeNull()
    expect(screen.getByRole("link", { name: "Ver la afirmación" })).toBeVisible()
  })

  it("says a refusal from the server", async () => {
    acciones.confirmarEtiquetaAccion.mockResolvedValueOnce({
      ok: false,
      error: "Esa marca ya no está. Recarga la página.",
    })
    render(<TarjetaDeEtiquetaDudosa tarjeta={tarjeta()} />)
    fireEvent.click(screen.getByRole("button", { name: "Está bien" }))
    expect(await screen.findByText("Esa marca ya no está. Recarga la página.")).toBeVisible()
  })
})
