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
