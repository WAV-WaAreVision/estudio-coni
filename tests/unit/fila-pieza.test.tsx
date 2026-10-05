import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { FilaPieza } from "@/components/fila-pieza"

describe("FilaPieza", () => {
  it("reads pillar, title and state, and links when there is something to do", () => {
    render(
      <ul>
        <FilaPieza pilar="deseo" titulo="El deseo no se apaga" estado="Guion · 52 s" href="/guion/1" />
      </ul>,
    )
    expect(screen.getByRole("link")).toHaveAccessibleName(/Deseo y sexualidad.*El deseo no se apaga.*Guion · 52 s/)
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
})
