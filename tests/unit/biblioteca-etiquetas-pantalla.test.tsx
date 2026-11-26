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

import { CabeceraDeAfirmacion } from "@/app/(app)/biblioteca/afirmaciones/[id]/cabecera-de-afirmacion"
import { EditorDeEtiqueta } from "@/app/(app)/biblioteca/afirmaciones/[id]/editor-de-etiqueta"
import { EtiquetasDeAfirmacion } from "@/app/(app)/biblioteca/afirmaciones/[id]/etiquetas-de-afirmacion"
import { opcionesDe } from "@/lib/dominio/biblioteca/etiquetas-de-afirmacion"
import {
  afirmacionAntiguaDePrueba,
  afirmacionDePrueba,
  CATALOGO_DE_PRUEBA,
  ID_DE_AFIRMACION,
  ID_DE_AUTORA,
  ID_DE_MATERIAL,
  ID_DE_TEMA,
  MARCA_DATO,
  MARCA_EMOCION_INSTAGRAM,
  marcaDePrueba,
} from "../fixtures/afirmaciones"

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
    expect(screen.getByLabelText("Frase")).toHaveFocus()
    expect(screen.getByRole("button", { name: "Está bien" })).toBeVisible()
    fireEvent.change(screen.getByLabelText("Frase"), { target: { value: " " } })
    fireEvent.click(screen.getByRole("button", { name: "Cambiar" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Escribe la frase.")
    expect(acciones.corregirEtiquetaAccion).not.toHaveBeenCalled()
  })

  it("offers no «Está bien» for a value that is not in the list, like a tipo still sin_clasificar", () => {
    render(
      <EditorDeEtiqueta
        afirmacionId={ID_DE_AFIRMACION}
        campo="tipo"
        red="todas"
        marcaId={null}
        titulo="Qué tipo de idea es"
        actual={{
          valor: "sin_clasificar",
          etiqueta: "Sin clasificar",
          frase: null,
          porQue: null,
          certezaBaja: false,
          revision: null,
        }}
        opciones={opcionesDe(CATALOGO_DE_PRUEBA, "tipo", "todas")}
        conFrase={false}
        quitable={false}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: /^Qué tipo de idea es/ }))
    expect(screen.queryByRole("button", { name: "Está bien" })).toBeNull()
    expect(screen.getByRole("button", { name: "Cambiar" })).toBeVisible()
  })

  it("offers no «Está bien» for a retired value, which the list no longer has", () => {
    render(<EditorDeEtiqueta {...emocion} actual={{ ...curiosidad, valor: "retirada", etiqueta: "Retirada" }} />)
    abrir()
    expect(screen.queryByRole("button", { name: "Está bien" })).toBeNull()
  })

  it("on opening moves the focus to the chosen option", () => {
    render(<EditorDeEtiqueta {...emocion} actual={curiosidad} />)
    abrir()
    expect(screen.getByRole("radio", { name: "Curiosidad" })).toHaveFocus()
  })

  it("«Cerrar» returns the focus to the tag and drops what she chose without saving", async () => {
    render(<EditorDeEtiqueta {...emocion} actual={curiosidad} />)
    const etiqueta = abrir()
    fireEvent.click(screen.getByRole("radio", { name: "Sorpresa" }))
    fireEvent.change(screen.getByLabelText("Frase"), { target: { value: "Otra frase" } })
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }))
    await waitFor(() => expect(etiqueta).toHaveFocus())
    fireEvent.click(etiqueta)
    expect(screen.getByRole("radio", { name: "Curiosidad" })).toBeChecked()
    expect(screen.getByLabelText("Frase")).toHaveValue("Abre la pregunta")
  })

  it("looks tappable with a caret that adds nothing to the tag's name", () => {
    render(<EditorDeEtiqueta {...emocion} actual={curiosidad} />)
    const etiqueta = screen.getByRole("button", { name: /^Emoción en Instagram/ })
    expect(etiqueta.querySelector('svg[aria-hidden="true"]')).not.toBeNull()
    expect(etiqueta).toHaveAccessibleName(/^Emoción en Instagram\s*Curiosidad\s*«Abre la pregunta»$/)
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

describe("CabeceraDeAfirmacion", () => {
  const fila = (termino: string) => screen.getByText(termino, { selector: "dt" }).nextElementSibling as HTMLElement

  it("gives the claim as the title, its quote, and links to its author, material and topic", () => {
    render(<CabeceraDeAfirmacion afirmacion={afirmacionDePrueba()} />)
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "«El aislamiento pesa más que las horas extra.»",
    )
    expect(fila("Cita")).toHaveTextContent("«El aislamiento pesa más que las horas extra, según la revisión.»")
    expect(within(fila("Autor")).getByRole("link", { name: "Daniela Ruiz" })).toHaveAttribute(
      "href",
      `/biblioteca/autores/${ID_DE_AUTORA}`,
    )
    expect(within(fila("Material")).getByRole("link", { name: "Burnout y teletrabajo" })).toHaveAttribute(
      "href",
      `/biblioteca/materiales/${ID_DE_MATERIAL}`,
    )
    expect(fila("Dónde")).toHaveTextContent("página 3")
    expect(within(fila("Tema")).getByRole("link", { name: "Carga mental" })).toHaveAttribute(
      "href",
      `/biblioteca/temas/${ID_DE_TEMA}`,
    )
  })

  it("says «Sin tema todavía» and leaves out an author that is not there", () => {
    render(<CabeceraDeAfirmacion afirmacion={afirmacionDePrueba({ tema: null, autor: null, ubicacion: null })} />)
    expect(fila("Tema")).toHaveTextContent("Sin tema todavía")
    expect(screen.queryByText("Autor", { selector: "dt" })).toBeNull()
    expect(screen.queryByText("Dónde", { selector: "dt" })).toBeNull()
  })
})

describe("EtiquetasDeAfirmacion", () => {
  const etiqueta = (nombre: RegExp) => screen.getByRole("button", { name: nombre })

  it("shows tipo and evidencia, each network's four marks, dato and caso, and the hook", () => {
    render(<EtiquetasDeAfirmacion afirmacion={afirmacionDePrueba()} catalogo={CATALOGO_DE_PRUEBA} />)
    expect(etiqueta(/^Qué tipo de idea es/)).toHaveTextContent("Dato")
    expect(etiqueta(/^Qué la respalda/)).toHaveTextContent("Estudio")
    const linkedin = screen.getByRole("region", { name: "LinkedIn" })
    expect(within(linkedin).getByRole("button", { name: /^Emoción en LinkedIn/ })).toHaveTextContent("Escepticismo")
    for (const falta of ["Problema", "Solución", "Público"])
      expect(within(linkedin).getByRole("button", { name: `Agregar ${falta} en LinkedIn` })).toBeVisible()
    const instagram = screen.getByRole("region", { name: "Instagram" })
    expect(within(instagram).getByRole("button", { name: /^Emoción en Instagram/ })).toHaveTextContent("Curiosidad")
    const datoYCaso = screen.getByRole("region", { name: "Dato y caso" })
    expect(within(datoYCaso).getByRole("button", { name: /^Dato/ })).toHaveTextContent("«El 70 % trabaja solo»")
    expect(within(datoYCaso).getByRole("button", { name: "Agregar Caso" })).toBeVisible()
    const gancho = screen.getByRole("region", { name: "Gancho" })
    expect(within(gancho).getByText("Frase exacta", { selector: "dt" }).nextElementSibling).toHaveTextContent(
      "«El aislamiento pesa más que las horas extra.»",
    )
    expect(within(gancho).getByText("Frase sin gancho", { selector: "dt" }).nextElementSibling).toHaveTextContent(
      "El aislamiento cansa más que el trabajo.",
    )
    expect(within(gancho).getByRole("button", { name: /^Tipo de gancho/ })).toHaveTextContent("Verdad incómoda")
    expect(screen.getAllByText("Certeza baja")).toHaveLength(1)
    expect(screen.queryByText("Llegan al reprocesar la Biblioteca")).toBeNull()
  })

  it("says «Corregida por ti» on a mark she corrected and «Confirmada por ti» on a tipo she confirmed", () => {
    const creadaEn = "2026-11-26T10:00:00+00:00"
    render(
      <EtiquetasDeAfirmacion
        afirmacion={afirmacionDePrueba({
          marcas: [
            marcaDePrueba({
              id: MARCA_EMOCION_INSTAGRAM,
              red: "instagram",
              valor: "sorpresa",
              certeza: "alta",
              origen: "coni",
            }),
          ],
          correcciones: [
            { campo: "emocion", red: "instagram", accion: "corrige", creadaEn },
            { campo: "tipo", red: "todas", accion: "confirma", creadaEn },
          ],
        })}
        catalogo={CATALOGO_DE_PRUEBA}
      />,
    )
    expect(within(screen.getByRole("region", { name: "Instagram" })).getByText("Corregida por ti")).toBeVisible()
    expect(within(screen.getByRole("region", { name: "La idea" })).getByText("Confirmada por ti")).toBeVisible()
  })

  it("on an old claim keeps tipo and evidencia, and says the marks arrive with the reprocess, with the old text", () => {
    render(<EtiquetasDeAfirmacion afirmacion={afirmacionAntiguaDePrueba()} catalogo={CATALOGO_DE_PRUEBA} />)
    expect(etiqueta(/^Qué tipo de idea es/)).toBeVisible()
    expect(etiqueta(/^Qué la respalda/)).toBeVisible()
    const marcas = screen.getByRole("region", { name: "Marcas" })
    expect(within(marcas).getByText("Llegan al reprocesar la Biblioteca")).toBeVisible()
    const viejo = (termino: string) => within(marcas).getByText(termino, { selector: "dt" }).nextElementSibling
    expect(viejo("Público")).toHaveTextContent("Parejas que trabajan")
    expect(viejo("Dolor")).toHaveTextContent("La carga invisible")
    expect(viejo("Emoción")).toHaveTextContent("Alivio")
    expect(viejo("Gancho")).toHaveTextContent("«¿Y si la pausa fuera parte del trabajo?»")
    expect(screen.queryByRole("button", { name: /Emoción en/ })).toBeNull()
    expect(screen.queryByRole("region", { name: "LinkedIn" })).toBeNull()
    expect(screen.queryByRole("region", { name: "Gancho" })).toBeNull()
  })

  it("after «Cambiar» gives the focus back to the tag, also when the refreshed page remounts it", async () => {
    const { rerender } = render(
      <EtiquetasDeAfirmacion afirmacion={afirmacionDePrueba()} catalogo={CATALOGO_DE_PRUEBA} />,
    )
    fireEvent.click(etiqueta(/^Emoción en Instagram/))
    fireEvent.click(screen.getByRole("radio", { name: "Sorpresa" }))
    fireEvent.click(screen.getByRole("button", { name: "Cambiar" }))
    await waitFor(() => expect(etiqueta(/^Emoción en Instagram/)).toHaveAttribute("aria-expanded", "false"))
    const corregida = afirmacionDePrueba({
      marcas: [
        marcaDePrueba(),
        marcaDePrueba({ id: MARCA_EMOCION_INSTAGRAM, red: "instagram", valor: "sorpresa", frase: "Abre la pregunta" }),
      ],
    })
    rerender(<EtiquetasDeAfirmacion afirmacion={corregida} catalogo={CATALOGO_DE_PRUEBA} />)
    await waitFor(() => expect(etiqueta(/^Emoción en Instagram/)).toHaveTextContent("Sorpresa"))
    await waitFor(() => expect(etiqueta(/^Emoción en Instagram/)).toHaveFocus())
  })

  it("after «Quitar» moves the focus to that row's «Agregar»", async () => {
    const { rerender } = render(
      <EtiquetasDeAfirmacion afirmacion={afirmacionDePrueba()} catalogo={CATALOGO_DE_PRUEBA} />,
    )
    fireEvent.click(etiqueta(/^Emoción en Instagram/))
    fireEvent.click(screen.getByRole("button", { name: "Quitar" }))
    fireEvent.click(screen.getByRole("button", { name: "Quitar" }))
    await waitFor(() => expect(acciones.quitarMarcaAccion).toHaveBeenCalled())
    rerender(
      <EtiquetasDeAfirmacion
        afirmacion={afirmacionDePrueba({ marcas: [marcaDePrueba()] })}
        catalogo={CATALOGO_DE_PRUEBA}
      />,
    )
    await waitFor(() => expect(screen.getByRole("button", { name: "Agregar Emoción en Instagram" })).toHaveFocus())
  })

  it("after adding a mark moves the focus to the new tag", async () => {
    const { rerender } = render(
      <EtiquetasDeAfirmacion afirmacion={afirmacionDePrueba({ marcas: [] })} catalogo={CATALOGO_DE_PRUEBA} />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Agregar Emoción en Instagram" }))
    fireEvent.click(screen.getByRole("radio", { name: "Sorpresa" }))
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }))
    await waitFor(() => expect(acciones.corregirEtiquetaAccion).toHaveBeenCalled())
    rerender(
      <EtiquetasDeAfirmacion
        afirmacion={afirmacionDePrueba({
          marcas: [marcaDePrueba({ id: MARCA_EMOCION_INSTAGRAM, red: "instagram", valor: "sorpresa", origen: "coni" })],
        })}
        catalogo={CATALOGO_DE_PRUEBA}
      />,
    )
    await waitFor(() => expect(etiqueta(/^Emoción en Instagram/)).toHaveFocus())
  })

  it("lets her add marks to a new claim with zero marks (extracted after 6c-1, or after removing the last one)", () => {
    render(
      <EtiquetasDeAfirmacion
        afirmacion={afirmacionDePrueba({ marcas: [], gancho: null })}
        catalogo={CATALOGO_DE_PRUEBA}
      />,
    )
    expect(screen.getByRole("button", { name: "Agregar Emoción en LinkedIn" })).toBeVisible()
    expect(screen.queryByText("Llegan al reprocesar la Biblioteca")).toBeNull()
  })
})
