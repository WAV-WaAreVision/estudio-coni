import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { FocoDelPanel } from "@/app/(app)/biblioteca/foco-del-panel"

const ID = "11111111-2222-4333-8444-555555555555"
const OTRO = "99999999-2222-4333-8444-555555555555"

function Pantalla({ seleccion }: { seleccion: string | null }) {
  return (
    <>
      <FocoDelPanel seleccion={seleccion} />
      <a href="#a" data-abre-panel={ID}>
        Burnout
      </a>
      <a href="#b" data-abre-panel={OTRO}>
        Fatiga
      </a>
      {seleccion ? (
        <section>
          <h2 id="panel-titulo" tabIndex={-1}>
            Panel de {seleccion}
          </h2>
          <a href="#c" data-cierra-panel={seleccion}>
            Cerrar el panel
          </a>
        </section>
      ) : null}
    </>
  )
}

describe("FocoDelPanel", () => {
  it("moves the focus to the panel's heading when a row opens it", () => {
    const { rerender } = render(<Pantalla seleccion={null} />)
    fireEvent.click(screen.getByRole("link", { name: "Burnout" }))
    rerender(<Pantalla seleccion={ID} />)
    expect(screen.getByRole("heading", { name: `Panel de ${ID}` })).toHaveFocus()
  })

  it("also finds the heading when the page remounts after the navigation", () => {
    const { unmount } = render(<Pantalla seleccion={null} />)
    fireEvent.click(screen.getByRole("link", { name: "Fatiga" }))
    unmount()
    render(<Pantalla seleccion={OTRO} />)
    expect(screen.getByRole("heading", { name: `Panel de ${OTRO}` })).toHaveFocus()
  })

  it("returns the focus to the row that opened it when the panel closes", () => {
    const { rerender } = render(<Pantalla seleccion={ID} />)
    fireEvent.click(screen.getByRole("link", { name: "Cerrar el panel" }))
    rerender(<Pantalla seleccion={null} />)
    expect(screen.getByRole("link", { name: "Burnout" })).toHaveFocus()
  })

  it("leaves the focus alone on a plain load with the panel already open", () => {
    render(<Pantalla seleccion={ID} />)
    expect(document.body).toHaveFocus()
  })
})
