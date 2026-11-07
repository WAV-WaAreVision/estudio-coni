import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { EstadoDeMaterial } from "@/app/(app)/biblioteca/estado-de-material"
import { NavDeBiblioteca } from "@/app/(app)/biblioteca/nav-de-biblioteca"
import { TemaDelMaterial } from "@/app/(app)/biblioteca/tema-del-material"

const base = { estado: "procesando", motivo_fallo: null, costo_estimado_usd: null, costo_confirmado_en: null }

const NOMBRE_DE_LA_NAV = "Secciones de la Biblioteca"

/** The two navs share the landmark name; CSS keeps one of them out of the tree at each width. */
function navs() {
  const todas = screen.getAllByRole("navigation", { name: NOMBRE_DE_LA_NAV })
  const menu = todas.find((nav) => nav.classList.contains("md:hidden"))
  const pestanas = todas.find((nav) => nav.classList.contains("md:block"))
  if (!menu || !pestanas) throw new Error("expected the phone menu and the computer tabs")
  return { todas, menu, pestanas }
}

const boton = () => screen.getByRole("button", { name: /^Sección de la Biblioteca: / })

describe("NavDeBiblioteca (4c)", () => {
  it("shows the four sections as tabs from md up, Semana after Temas, each with an icon and its name", () => {
    render(<NavDeBiblioteca actual="semana" />)
    const { todas, pestanas } = navs()
    expect(todas).toHaveLength(2)
    expect(pestanas).toHaveClass("hidden", "md:block")
    const enlaces = within(pestanas).getAllByRole("link")
    expect(enlaces.map((enlace) => enlace.textContent)).toEqual(["Materiales", "Autores", "Temas", "Semana"])
    expect(enlaces.map((enlace) => enlace.getAttribute("href"))).toEqual([
      "/biblioteca",
      "/biblioteca/autores",
      "/biblioteca/temas",
      "/biblioteca/semana",
    ])
    expect(enlaces[3]).toHaveAttribute("aria-current", "page")
    expect(pestanas.querySelectorAll("svg")).toHaveLength(4)
  })

  it("hugs its tabs and slides them on one row instead of pushing the page sideways", () => {
    render(<NavDeBiblioteca actual="materiales" />)
    expect(within(navs().pestanas).getByRole("list")).toHaveClass(
      "w-fit",
      "max-w-full",
      "flex-nowrap",
      "overflow-x-auto",
    )
  })
})

describe("NavDeBiblioteca on the phone: the section menu", () => {
  it("is a button naming the open section, folded, below md only", () => {
    render(<NavDeBiblioteca actual="semana" />)
    const { menu } = navs()
    expect(menu).toHaveClass("md:hidden")
    const elBoton = within(menu).getByRole("button", { name: "Sección de la Biblioteca: Semana" })
    expect(elBoton).toHaveTextContent("Semana")
    expect(elBoton).toHaveAttribute("aria-expanded", "false")
    expect(elBoton).toHaveClass("min-h-objetivo")
    expect(elBoton.querySelectorAll("svg")).toHaveLength(2)
    const lista = document.getElementById(elBoton.getAttribute("aria-controls") ?? "")
    expect(lista).not.toBeNull()
    expect(lista).not.toBeVisible()
    expect(within(menu).queryAllByRole("link")).toHaveLength(0)
  })

  it("opens the sections as links with their icons, the open one marked and checked, each a full target", () => {
    render(<NavDeBiblioteca actual="semana" />)
    fireEvent.click(boton())
    expect(boton()).toHaveAttribute("aria-expanded", "true")
    const enlaces = within(navs().menu).getAllByRole("link")
    expect(enlaces.map((enlace) => enlace.textContent)).toEqual(["Materiales", "Autores", "Temas", "Semana"])
    expect(enlaces.map((enlace) => enlace.getAttribute("href"))).toEqual([
      "/biblioteca",
      "/biblioteca/autores",
      "/biblioteca/temas",
      "/biblioteca/semana",
    ])
    for (const enlace of enlaces) expect(enlace).toHaveClass("min-h-objetivo")
    expect(enlaces[3]).toHaveAttribute("aria-current", "page")
    expect(enlaces.slice(0, 3).map((enlace) => enlace.getAttribute("aria-current"))).toEqual([null, null, null])
    expect(enlaces[3]?.querySelectorAll("svg")).toHaveLength(2)
    expect(enlaces[0]?.querySelectorAll("svg")).toHaveLength(1)
  })

  it("folds again when a section is chosen", () => {
    render(<NavDeBiblioteca actual="semana" />)
    fireEvent.click(boton())
    const autores = within(navs().menu).getByRole("link", { name: "Autores" })
    autores.addEventListener("click", (evento) => evento.preventDefault())
    fireEvent.click(autores)
    expect(boton()).toHaveAttribute("aria-expanded", "false")
    expect(within(navs().menu).queryAllByRole("link")).toHaveLength(0)
  })

  it("folds on Escape and gives the focus back to the button", () => {
    render(<NavDeBiblioteca actual="semana" />)
    fireEvent.click(boton())
    const temas = within(navs().menu).getByRole("link", { name: "Temas" })
    temas.focus()
    fireEvent.keyDown(temas, { key: "Escape" })
    expect(boton()).toHaveAttribute("aria-expanded", "false")
    expect(boton()).toHaveFocus()
  })

  it("folds on a tap outside it, and not on a tap inside it", () => {
    render(
      <>
        <NavDeBiblioteca actual="materiales" />
        <p>Fuera</p>
      </>,
    )
    fireEvent.click(boton())
    fireEvent.pointerDown(within(navs().menu).getByRole("link", { name: "Temas" }))
    expect(boton()).toHaveAttribute("aria-expanded", "true")
    fireEvent.pointerDown(screen.getByText("Fuera"))
    expect(boton()).toHaveAttribute("aria-expanded", "false")
  })
})

describe("EstadoDeMaterial (4j)", () => {
  it.each([
    [{ ...base }, "Procesando"],
    [{ ...base, motivo_fallo: "tope_mensual" }, "En pausa"],
    [{ ...base, costo_estimado_usd: 1.2 }, "Espera tu OK"],
    [{ ...base, estado: "listo" }, "Listo"],
    [{ ...base, estado: "fallido" }, "Con error"],
  ])("draws %j as an icon and «%s»", (material, palabra) => {
    render(<EstadoDeMaterial material={material} />)
    const pildora = screen.getByText(palabra).parentElement
    expect(pildora?.querySelectorAll("svg")).toHaveLength(1)
  })

  it("draws an error in the error colour, the only state with a colour of its own", () => {
    render(<EstadoDeMaterial material={{ ...base, estado: "fallido" }} />)
    expect(screen.getByText("Con error").parentElement).toHaveClass("text-error")
  })
})

describe("TemaDelMaterial", () => {
  it("shows +N and reads it in words", () => {
    const { container } = render(<TemaDelMaterial tema={{ id: "t1", nombre: "Carga mental", otros: 2 }} />)
    expect(screen.getByText("Carga mental +2")).toHaveAttribute("aria-hidden", "true")
    expect(screen.getByText("Carga mental y 2 temas más")).toHaveClass("sr-only")
    expect(container.textContent).toContain("Carga mental +2")
    expect(screen.queryByRole("link")).toBeNull()
  })

  it("links to the topic when asked, named in words", () => {
    render(<TemaDelMaterial tema={{ id: "t1", nombre: "Carga mental", otros: 2 }} conEnlace />)
    expect(screen.getByRole("link", { name: "Carga mental y 2 temas más" })).toHaveAttribute(
      "href",
      "/biblioteca/temas/t1",
    )
  })

  it("never links a material without a topic", () => {
    render(<TemaDelMaterial tema={null} conEnlace />)
    expect(screen.queryByRole("link")).toBeNull()
    expect(screen.getAllByText("Sin tema todavía")).toHaveLength(2)
  })
})
