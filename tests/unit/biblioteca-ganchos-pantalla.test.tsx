import { fireEvent, render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

type Respuesta = { ok: true } | { ok: false; error: string }

const { acciones } = vi.hoisted(() => ({
  acciones: {
    marcarFavoritoAccion: vi.fn(async (..._: unknown[]): Promise<Respuesta> => ({ ok: true })),
    guardarMisTiposAccion: vi.fn(async (..._: unknown[]): Promise<Respuesta> => ({ ok: true })),
  },
}))
vi.mock("@/app/(app)/biblioteca/acciones", () => acciones)
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }))

import { BotonFavorito } from "@/app/(app)/biblioteca/ganchos/boton-favorito"
import { DetalleDeGancho } from "@/app/(app)/biblioteca/ganchos/detalle-de-gancho"
import { ListaDeGanchos } from "@/app/(app)/biblioteca/ganchos/lista-de-ganchos"
import { PanelDeGancho } from "@/app/(app)/biblioteca/ganchos/panel-de-gancho"
import { TablaDeGanchos } from "@/app/(app)/biblioteca/ganchos/tabla-de-ganchos"
import { ganchoDePrueba, ID_DE_GANCHO, PILAR_DE_INSTAGRAM, TIPOS_DE_PRUEBA } from "../fixtures/ganchos"

beforeEach(() => vi.clearAllMocks())

describe("DetalleDeGancho", () => {
  it("gives a classified hook's parts and where it comes from, with links", () => {
    const gancho = ganchoDePrueba({
      pilares: [
        { red: "linkedin", pilarId: "p1", nombre: "Bienestar e impacto" },
        { red: "linkedin", pilarId: "p2", nombre: "Diagnóstico doble" },
        { red: "instagram", pilarId: PILAR_DE_INSTAGRAM, nombre: "Mi nueva partida" },
      ],
    })
    render(<DetalleDeGancho gancho={gancho} tipos={TIPOS_DE_PRUEBA} />)
    const fila = (termino: string) => screen.getByText(termino, { selector: "dt" }).nextElementSibling
    expect(fila("Tipo")).toHaveTextContent("Número específico")
    expect(fila("Frase sin gancho")).toHaveTextContent("Pocas personas descansan.")
    expect(within(fila("Autor") as HTMLElement).getByRole("link", { name: "Daniela Ruiz" })).toHaveAttribute(
      "href",
      `/biblioteca/autores/${gancho.autor?.id}`,
    )
    expect(
      within(fila("Material") as HTMLElement).getByRole("link", { name: "Burnout y teletrabajo" }),
    ).toHaveAttribute("href", `/biblioteca/materiales/${gancho.material.id}`)
    expect(fila("Dónde")).toHaveTextContent("página 3")
    expect(within(fila("Tema") as HTMLElement).getByRole("link", { name: "Carga mental" })).toHaveAttribute(
      "href",
      `/biblioteca/temas/${gancho.tema?.id}`,
    )
    expect(fila("Pilar en LinkedIn")).toHaveTextContent("Bienestar e impacto · Diagnóstico doble")
    expect(fila("Pilar en Instagram")).toHaveTextContent("Mi nueva partida")
    expect(screen.queryByText(/Sin clasificar:/)).toBeNull()
  })

  it("says an old hook waits for the reprocess, and «Sin red» without pillars", () => {
    render(
      <DetalleDeGancho
        gancho={ganchoDePrueba({
          tipo: "sin_clasificar",
          clasificado: false,
          fraseSinGancho: null,
          certeza: null,
          pilares: [],
          tema: null,
        })}
        tipos={TIPOS_DE_PRUEBA}
      />,
    )
    expect(
      screen.getByText("Sin clasificar: el tipo y la frase sin gancho llegan al reprocesar la Biblioteca."),
    ).toBeVisible()
    expect(screen.getByText("Tipo", { selector: "dt" }).nextElementSibling).toHaveTextContent("Sin clasificar")
    expect(screen.queryByText("Frase sin gancho")).toBeNull()
    expect(screen.getByText("Red", { selector: "dt" }).nextElementSibling).toHaveTextContent("Sin red")
  })
})

describe("BotonFavorito", () => {
  it("is a toggle named Favorito that flips the stored star", async () => {
    render(<BotonFavorito afirmacionId={ID_DE_GANCHO} favorito={false} />)
    const boton = screen.getByRole("button", { name: "Favorito" })
    expect(boton).toHaveAttribute("aria-pressed", "false")
    fireEvent.click(boton)
    await vi.waitFor(() =>
      expect(acciones.marcarFavoritoAccion).toHaveBeenCalledWith({ afirmacionId: ID_DE_GANCHO, favorito: true }),
    )
  })

  it("unmarks a favorite and says a refusal", async () => {
    acciones.marcarFavoritoAccion.mockResolvedValueOnce({ ok: false, error: "Ese gancho ya no está en la Biblioteca." })
    render(<BotonFavorito afirmacionId={ID_DE_GANCHO} favorito />)
    const boton = screen.getByRole("button", { name: "Favorito" })
    expect(boton).toHaveAttribute("aria-pressed", "true")
    fireEvent.click(boton)
    expect(await screen.findByRole("alert")).toHaveTextContent("Ese gancho ya no está en la Biblioteca.")
    expect(acciones.marcarFavoritoAccion).toHaveBeenCalledWith({ afirmacionId: ID_DE_GANCHO, favorito: false })
  })
})

describe("PanelDeGancho", () => {
  it("is a region named by the exact phrase, with the star and its own close link that keeps the filters", () => {
    render(<PanelDeGancho gancho={ganchoDePrueba()} tipos={TIPOS_DE_PRUEBA} filtros={{ red: "linkedin" }} />)
    const region = screen.getByRole("region", { name: "«El 70 % no descansa.»" })
    expect(within(region).getByRole("heading", { level: 2 })).toHaveAttribute("id", "panel-titulo")
    expect(within(region).getByRole("heading", { level: 2 })).toHaveAttribute("tabindex", "-1")
    expect(within(region).getByRole("button", { name: "Favorito" })).toBeVisible()
    const cerrar = within(region).getByRole("link", { name: "Cerrar el panel" })
    expect(cerrar).toHaveAttribute("href", "/biblioteca/ganchos?red=linkedin")
    expect(cerrar).toHaveAttribute("data-cierra-panel", ID_DE_GANCHO)
  })
})

describe("ListaDeGanchos", () => {
  const favorito = ganchoDePrueba({ afirmacionId: "a1b2c3d4-0000-4000-8000-000000000001", favorito: true })
  const viejo = ganchoDePrueba({
    afirmacionId: "a1b2c3d4-0000-4000-8000-000000000002",
    fraseExacta: "¿Y si descansar fuera trabajo?",
    tipo: "sin_clasificar",
    clasificado: false,
    autor: null,
  })

  it("draws cards on the phone that open each hook's page, with type, author and the star", () => {
    render(<ListaDeGanchos ganchos={[favorito, viejo]} tipos={TIPOS_DE_PRUEBA} filtros={{}} seleccion={null} />)
    const lista = screen.getByRole("list", { name: "Ganchos" })
    expect(lista).toHaveClass("md:hidden")
    const tarjetas = within(lista).getAllByRole("listitem")
    expect(within(tarjetas[0] as HTMLElement).getByRole("link")).toHaveAttribute(
      "href",
      `/biblioteca/ganchos/${favorito.afirmacionId}`,
    )
    expect(tarjetas[0]).toHaveTextContent("«El 70 % no descansa.»")
    expect(tarjetas[0]).toHaveTextContent("Número específico · Daniela Ruiz")
    expect(tarjetas[0]).toHaveTextContent("Favorito")
    expect(tarjetas[1]).toHaveTextContent("Sin clasificar")
    expect(tarjetas[1]).not.toHaveTextContent("Favorito")
  })
})

describe("TablaDeGanchos", () => {
  it("has the five columns, rows that open the side panel keeping the filters, and marks the chosen row", () => {
    const gancho = ganchoDePrueba({ favorito: true })
    render(
      <TablaDeGanchos
        ganchos={[gancho]}
        tipos={TIPOS_DE_PRUEBA}
        filtros={{ tipo: "numero_especifico" }}
        seleccion={ID_DE_GANCHO}
      />,
    )
    const tabla = screen.getByRole("table", { name: "Ganchos" })
    expect(
      within(tabla)
        .getAllByRole("columnheader")
        .map((celda) => celda.textContent),
    ).toEqual(["Frase exacta", "Tipo", "Autor", "Tema", "Favorito"])
    const enlace = within(tabla).getByRole("link", { name: "«El 70 % no descansa.»" })
    expect(enlace).toHaveAttribute("href", `/biblioteca/ganchos?tipo=numero_especifico&g=${ID_DE_GANCHO}`)
    expect(enlace).toHaveAttribute("data-abre-panel", ID_DE_GANCHO)
    expect(enlace).toHaveAttribute("aria-current", "true")
    const fila = within(tabla).getAllByRole("row")[1] as HTMLElement
    expect(fila).toHaveTextContent("Número específico")
    expect(fila).toHaveTextContent("Daniela Ruiz")
    expect(fila).toHaveTextContent("Carga mental")
    expect(within(fila).getByText("Favorito")).toHaveClass("sr-only")
  })

  it("leaves the author and topic columns for wide screens, so the table fits beside the panel", () => {
    render(<TablaDeGanchos ganchos={[ganchoDePrueba()]} tipos={TIPOS_DE_PRUEBA} filtros={{}} seleccion={null} />)
    const [, , autor, tema] = screen.getAllByRole("columnheader")
    expect(autor).toHaveClass("hidden", "lg:table-cell")
    expect(tema).toHaveClass("hidden", "lg:table-cell")
  })
})
