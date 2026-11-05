import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { PanelDeTema } from "@/app/(app)/biblioteca/temas/panel-de-tema"
import { TablaDeTemas } from "@/app/(app)/biblioteca/temas/tabla-de-temas"
import { TarjetaDeTema } from "@/app/(app)/biblioteca/temas/tarjeta-de-tema"
import type { TemaResumido } from "@/lib/dominio/biblioteca/temas"

const CARGA = "11111111-2222-4333-8444-555555555555"
const PAUSAS = "22222222-2222-4333-8444-555555555555"
const PILAR = "33333333-2222-4333-8444-555555555555"
const carga: TemaResumido = {
  id: CARGA,
  nombre: "Carga mental",
  descripcion: "El peso de lo que nadie ve.",
  pilarId: PILAR,
  ideas: 12,
  autores: 3,
  tratado: true,
}
const pausas: TemaResumido = {
  id: PAUSAS,
  nombre: "Pausas activas",
  descripcion: null,
  pilarId: null,
  ideas: 1,
  autores: 1,
  tratado: false,
}

const enLista = (tema: TemaResumido) =>
  render(
    <ul>
      <TarjetaDeTema tema={tema} />
    </ul>,
  )

describe("TarjetaDeTema", () => {
  it("shows the name and the counts without zeros, and opens the topic", () => {
    enLista(carga)
    const tarjeta = screen.getByRole("listitem")
    expect(tarjeta).toHaveTextContent("12 ideas sacadas · 3 autores")
    expect(within(tarjeta).getByRole("link")).toHaveAttribute("href", `/biblioteca/temas/${CARGA}`)
  })

  it("says «Ya lo traté» and «Un solo autor» only when they apply", () => {
    const { unmount } = enLista(carga)
    expect(screen.getByText("Ya lo traté")).toBeInTheDocument()
    expect(screen.queryByText("Un solo autor")).toBeNull()
    unmount()
    enLista(pausas)
    expect(screen.getByRole("listitem")).toHaveTextContent("1 idea sacada · 1 autor")
    expect(screen.getByText("Un solo autor")).toBeInTheDocument()
    expect(screen.queryByText("Ya lo traté")).toBeNull()
  })
})

describe("TablaDeTemas", () => {
  it("has three columns, rows that open the side panel with ?t keeping the filters, and badges under the name", () => {
    render(
      <TablaDeTemas
        temas={[carga, pausas]}
        filtros={{ red: "linkedin", tratados: true, pilar: PILAR }}
        seleccion={CARGA}
      />,
    )
    const tabla = screen.getByRole("table", { name: "Temas" })
    expect(
      within(tabla)
        .getAllByRole("columnheader")
        .map((celda) => celda.textContent),
    ).toEqual(["Tema", "Ideas sacadas", "Autores"])
    const fila = within(tabla).getByRole("link", { name: "Carga mental" })
    expect(fila).toHaveAttribute("href", `/biblioteca/temas?red=linkedin&pilar=${PILAR}&tratados=1&t=${CARGA}`)
    expect(fila).toHaveAttribute("data-abre-panel", CARGA)
    expect(fila).toHaveAttribute("aria-current", "true")
    expect(within(tabla).getByRole("row", { name: /Carga mental/ })).toHaveTextContent("Ya lo traté")
  })
})

describe("PanelDeTema", () => {
  it("is a region named by the topic, with its description, counts, badges and the way to its ideas", () => {
    render(<PanelDeTema tema={carga} filtros={{ red: "linkedin", tratados: true }} />)
    const region = screen.getByRole("region", { name: "Carga mental" })
    expect(region).toHaveTextContent("El peso de lo que nadie ve.")
    expect(region).toHaveTextContent("12 ideas sacadas · 3 autores")
    expect(region).toHaveTextContent("Ya lo traté")
    expect(within(region).getByRole("link", { name: "Ver sus ideas" })).toHaveAttribute(
      "href",
      `/biblioteca/temas/${CARGA}`,
    )
    const cerrar = within(region).getByRole("link", { name: "Cerrar el panel" })
    expect(cerrar).toHaveAttribute("href", "/biblioteca/temas?red=linkedin&tratados=1")
    expect(cerrar).toHaveAttribute("data-cierra-panel", CARGA)
    expect(screen.getByRole("heading", { level: 2 })).toHaveAttribute("id", "panel-titulo")
    expect(screen.getByRole("heading", { level: 2 })).toHaveAttribute("tabindex", "-1")
  })
})
