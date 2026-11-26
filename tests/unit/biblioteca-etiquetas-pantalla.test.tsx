import { fireEvent, render, screen, waitFor } from "@testing-library/react"
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
import { opcionesDe } from "@/lib/dominio/biblioteca/etiquetas-de-afirmacion"
import { CATALOGO_DE_PRUEBA, ID_DE_AFIRMACION, MARCA_DATO, MARCA_EMOCION_INSTAGRAM } from "../fixtures/afirmaciones"

beforeEach(() => vi.clearAllMocks())

describe("EditorDeEtiqueta", () => {
  const emocion = {
    afirmacionId: ID_DE_AFIRMACION,
    campo: "emocion" as const,
    red: "instagram" as const,
    marcaId: MARCA_EMOCION_INSTAGRAM,
    titulo: "Emoción en Instagram",
    opciones: opcionesDe(CATALOGO_DE_PRUEBA, "emocion", "instagram"),
    conFrase: true,
    quitable: true,
  }
  const curiosidad = {
    valor: "curiosidad",
    etiqueta: "Curiosidad",
    frase: "Abre la pregunta",
    porQue: null,
    certezaBaja: true,
    revision: null,
  }
  const abrir = () => {
    const etiqueta = screen.getByRole("button", { name: /^Emoción en Instagram/ })
    fireEvent.click(etiqueta)
    return etiqueta
  }

  it("shows the tag with its phrase and «Certeza baja», and opens its list grouped by grupo", () => {
    render(<EditorDeEtiqueta {...emocion} actual={curiosidad} />)
    const etiqueta = screen.getByRole("button", { name: /^Emoción en Instagram/ })
    expect(etiqueta).toHaveTextContent("Curiosidad")
    expect(etiqueta).toHaveTextContent("«Abre la pregunta»")
    expect(etiqueta).toHaveAttribute("aria-expanded", "false")
    expect(screen.getByText("Certeza baja")).toBeVisible()
    fireEvent.click(etiqueta)
    expect(etiqueta).toHaveAttribute("aria-expanded", "true")
    const grupos = screen.getAllByRole("group")
    expect(grupos.map((grupo) => grupo.querySelector("legend")?.textContent)).toEqual([
      "Problema",
      "Puente",
      "Solución",
      "Respaldo",
    ])
    expect(screen.getByRole("radio", { name: "Curiosidad" })).toBeChecked()
    expect(screen.getByRole("radio", { name: "Agobio" })).toHaveAccessibleDescription(
      "Activación alta. Demasiado, ahora: sobrecarga, no doy abasto.",
    )
    expect(screen.getByLabelText("Frase")).toHaveValue("Abre la pregunta")
  })

  it("«Cambiar» sends the chosen value with the phrase, then closes", async () => {
    render(<EditorDeEtiqueta {...emocion} actual={curiosidad} />)
    const etiqueta = abrir()
    fireEvent.click(screen.getByRole("radio", { name: "Sorpresa" }))
    fireEvent.change(screen.getByLabelText("Frase"), { target: { value: "Rompe la creencia" } })
    fireEvent.click(screen.getByRole("button", { name: "Cambiar" }))
    await waitFor(() =>
      expect(acciones.corregirEtiquetaAccion).toHaveBeenCalledWith({
        afirmacionId: ID_DE_AFIRMACION,
        campo: "emocion",
        red: "instagram",
        marcaId: MARCA_EMOCION_INSTAGRAM,
        valor: "sorpresa",
        frase: "Rompe la creencia",
        porQue: "",
      }),
    )
    await waitFor(() => expect(etiqueta).toHaveAttribute("aria-expanded", "false"))
  })

  it("«Está bien» confirms the tag as it is", async () => {
    render(<EditorDeEtiqueta {...emocion} actual={curiosidad} />)
    abrir()
    fireEvent.click(screen.getByRole("button", { name: "Está bien" }))
    await waitFor(() =>
      expect(acciones.confirmarEtiquetaAccion).toHaveBeenCalledWith({
        afirmacionId: ID_DE_AFIRMACION,
        campo: "emocion",
        red: "instagram",
        marcaId: MARCA_EMOCION_INSTAGRAM,
      }),
    )
    expect(acciones.corregirEtiquetaAccion).not.toHaveBeenCalled()
  })

  it("asks one line of why for «Otra» before sending, then sends it", async () => {
    render(<EditorDeEtiqueta {...emocion} actual={curiosidad} />)
    abrir()
    expect(screen.queryByLabelText("¿Por qué? En una línea")).toBeNull()
    fireEvent.click(screen.getByRole("radio", { name: "Otra" }))
    fireEvent.click(screen.getByRole("button", { name: "Cambiar" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Escribe en una línea por qué.")
    expect(acciones.corregirEtiquetaAccion).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText("¿Por qué? En una línea"), { target: { value: "Es ternura" } })
    fireEvent.click(screen.getByRole("button", { name: "Cambiar" }))
    await waitFor(() =>
      expect(acciones.corregirEtiquetaAccion).toHaveBeenCalledWith(
        expect.objectContaining({ valor: "otra", porQue: "Es ternura" }),
      ),
    )
  })

  it("removes a mark only after its confirmation", async () => {
    render(<EditorDeEtiqueta {...emocion} actual={curiosidad} />)
    abrir()
    fireEvent.click(screen.getByRole("button", { name: "Quitar" }))
    expect(screen.getByText("¿Quito esta marca? Queda anotado que la quitaste.")).toHaveFocus()
    expect(acciones.quitarMarcaAccion).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Quitar" }))
    await waitFor(() =>
      expect(acciones.quitarMarcaAccion).toHaveBeenCalledWith({
        afirmacionId: ID_DE_AFIRMACION,
        marca: "emocion",
        red: "instagram",
        marcaId: MARCA_EMOCION_INSTAGRAM,
      }),
    )
  })

  it("adds a missing mark from «Agregar», asking for a value first", async () => {
    render(
      <EditorDeEtiqueta
        afirmacionId={ID_DE_AFIRMACION}
        campo="solucion"
        red="linkedin"
        marcaId={null}
        titulo="Solución en LinkedIn"
        actual={null}
        opciones={opcionesDe(CATALOGO_DE_PRUEBA, "solucion", "linkedin")}
        conFrase
        quitable={false}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Agregar Solución en LinkedIn" }))
    expect(screen.queryByRole("button", { name: "Está bien" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Quitar" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Elige un valor de la lista.")
    fireEvent.click(screen.getByRole("radio", { name: "RR.HH. llega tarde" }))
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }))
    await waitFor(() =>
      expect(acciones.corregirEtiquetaAccion).toHaveBeenCalledWith({
        afirmacionId: ID_DE_AFIRMACION,
        campo: "solucion",
        red: "linkedin",
        marcaId: null,
        valor: "rrhh_tarde",
        frase: "",
        porQue: "",
      }),
    )
  })

  it("asks for the phrase of a dato, which has no list", async () => {
    render(
      <EditorDeEtiqueta
        afirmacionId={ID_DE_AFIRMACION}
        campo="dato"
        red="todas"
        marcaId={MARCA_DATO}
        titulo="Dato"
        actual={{
          valor: "70 %",
          etiqueta: "70 %",
          frase: "El 70 % trabaja solo",
          porQue: null,
          certezaBaja: false,
          revision: null,
        }}
        opciones={[]}
        conFrase
        quitable
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: /^Dato/ }))
    expect(screen.queryAllByRole("radio")).toEqual([])
    fireEvent.change(screen.getByLabelText("Frase"), { target: { value: " " } })
    fireEvent.click(screen.getByRole("button", { name: "Cambiar" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Escribe la frase.")
    expect(acciones.corregirEtiquetaAccion).not.toHaveBeenCalled()
  })

  it("says a refusal from the server, and «Corregida por ti» with the reason of an «Otra»", async () => {
    acciones.corregirEtiquetaAccion.mockResolvedValueOnce({
      ok: false,
      error: "Ese valor ya no está en la lista. Recarga la página.",
    })
    render(
      <EditorDeEtiqueta
        {...emocion}
        actual={{
          ...curiosidad,
          valor: "otra",
          etiqueta: "Otra",
          porQue: "Es ternura",
          certezaBaja: false,
          revision: "Corregida por ti",
        }}
      />,
    )
    expect(screen.getByText("Corregida por ti")).toBeVisible()
    expect(screen.getByText("Por qué: Es ternura")).toBeVisible()
    expect(screen.queryByText("Certeza baja")).toBeNull()
    abrir()
    fireEvent.click(screen.getByRole("radio", { name: "Calma" }))
    fireEvent.click(screen.getByRole("button", { name: "Cambiar" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Ese valor ya no está en la lista. Recarga la página.")
  })
})
