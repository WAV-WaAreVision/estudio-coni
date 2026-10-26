import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { FilaPieza } from "@/components/fila-pieza"
import { pilarVisible } from "@/lib/dominio/pilares"
import { PILARES_DE_PRUEBA } from "../fixtures/pilares"

describe("FilaPieza", () => {
  it("reads pillar, title and state, and links when there is something to do", () => {
    render(
      <ul>
        <FilaPieza
          pilar={pilarVisible(PILARES_DE_PRUEBA, "deseo")}
          titulo="El deseo no se apaga"
          estado="Guion · 52 s"
          href="/guion/1"
        />
      </ul>,
    )
    expect(screen.getByRole("link")).toHaveAccessibleName(/Deseo.*El deseo no se apaga.*Guion · 52 s/)
  })

  it("shows the pillar by its short name in the compact row and keeps its slug for data-pilar", () => {
    render(
      <ul>
        <FilaPieza
          titulo="Lo que decidí no delegarle a mi avatar"
          estado="Lista para firmar"
          pilar={{ slug: "caso-coni", nombre: "Caso Coni: humana + avatar", nombreCorto: "Caso Coni" }}
          href="/guion/1"
        />
      </ul>,
    )
    expect(screen.getByText("Caso Coni")).toBeInTheDocument()
    expect(screen.queryByText("Caso Coni: humana + avatar")).toBeNull()
    expect(screen.getByRole("listitem")).toHaveAttribute("data-pilar", "caso-coni")
  })

  it("is not a link while working, and says so with the pulsing dot", () => {
    render(
      <ul>
        <FilaPieza pilar={null} titulo="¿Te achicas?" estado="Escribiendo el guion · te aviso" trabajando />
      </ul>,
    )
    expect(screen.queryByRole("link")).toBeNull()
    expect(document.querySelector(".punto-trabajando")).not.toBeNull()
    expect(document.querySelector(".esqueleto")).toBeNull()
  })

  it("hangs an unread dot in the margin with a screen-reader word", () => {
    render(
      <ul>
        <FilaPieza pilar={null} titulo="X" estado="Video · 48 s" href="/video/1" sinLeer />
      </ul>,
    )
    expect(screen.getByText("Sin leer")).toHaveClass("sr-only")
  })

  it("shows the real video thumbnail only when given, as a decorative image", () => {
    const { rerender } = render(
      <ul>
        <FilaPieza pilar={null} titulo="X" estado="Video · 48 s" href="/video/1" />
      </ul>,
    )
    expect(document.querySelector("img")).toBeNull()
    rerender(
      <ul>
        <FilaPieza
          pilar={null}
          titulo="X"
          estado="Video · 48 s"
          href="/video/1"
          miniatura="https://almacen.test/m.jpg"
        />
      </ul>,
    )
    const miniatura = document.querySelector("img")
    expect(miniatura).toHaveAttribute("src", "https://almacen.test/m.jpg")
    expect(miniatura).toHaveAttribute("alt", "")
  })

  it("is a 4.5rem row that turns honda while pressed, with the small working dot", () => {
    render(
      <ul>
        <FilaPieza pilar={null} titulo="X" estado="Grabando · unos 5 min · te aviso" href="/guion/1" trabajando />
      </ul>,
    )
    expect(screen.getByRole("link")).toHaveClass("min-h-fila", "active:bg-piedra-honda")
    expect(document.querySelector(".punto-trabajando")).toHaveAttribute("data-chico")
  })

  it("shows a failure's cause in a honda pill with its warning icon, in place of the state", () => {
    render(
      <ul>
        <FilaPieza
          pilar={pilarVisible(PILARES_DE_PRUEBA, "deseo")}
          titulo="El deseo"
          causa="No pude publicar."
          href="/video/1"
        />
      </ul>,
    )
    const causa = screen.getByText("No pude publicar.").parentElement
    expect(causa).toHaveClass("bg-piedra-honda")
    expect(causa?.querySelector("svg")).not.toBeNull()
  })
})
