import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ElegirAvatar } from "@/components/elegir-avatar"

const AVATARES = [
  { id: "look-a", nombre: "Estudio", imagenUrl: "https://almacen.test/avatares/look-a.jpg" },
  { id: "look-b", nombre: "Terraza", imagenUrl: "https://almacen.test/avatares/look-b.jpg" },
]

describe("ElegirAvatar", () => {
  it("offers every look as a radio with its name and leaves all of them unchecked", () => {
    render(<ElegirAvatar avatares={AVATARES} elegido={null} alElegir={() => undefined} />)

    const grupo = screen.getByRole("radiogroup", { name: "Elige con qué avatar se graba" })
    const radios = screen.getAllByRole("radio")
    expect(grupo).toBeInTheDocument()
    expect(radios.map((radio) => radio.getAttribute("aria-label") ?? radio.closest("label")?.textContent)).toEqual([
      "Estudio",
      "Terraza",
    ])
    expect(radios.some((radio) => (radio as HTMLInputElement).checked)).toBe(false)
  })

  it("puts the name as the alt text of each preview photo", () => {
    render(<ElegirAvatar avatares={AVATARES} elegido={null} alElegir={() => undefined} />)

    expect(screen.getByRole("img", { name: "Estudio" })).toHaveAttribute("src", AVATARES[0]?.imagenUrl)
    expect(screen.getByRole("img", { name: "Terraza" })).toBeInTheDocument()
  })

  it("reports the id of the look she picks and checks the chosen one", () => {
    const alElegir = vi.fn()
    const { rerender } = render(<ElegirAvatar avatares={AVATARES} elegido={null} alElegir={alElegir} />)

    fireEvent.click(screen.getByRole("radio", { name: "Terraza" }))
    expect(alElegir).toHaveBeenCalledWith("look-b")

    rerender(<ElegirAvatar avatares={AVATARES} elegido="look-b" alElegir={alElegir} />)
    expect(screen.getByRole("radio", { name: "Terraza" })).toBeChecked()
    expect(screen.getByRole("radio", { name: "Estudio" })).not.toBeChecked()
  })

  it("keeps the radios in one group so the arrow keys move between looks", () => {
    render(<ElegirAvatar avatares={AVATARES} elegido={null} alElegir={() => undefined} />)

    const nombres = screen.getAllByRole("radio").map((radio) => radio.getAttribute("name"))
    expect(new Set(nombres).size).toBe(1)
    expect(nombres[0]).toBeTruthy()
  })

  it("makes every option at least 44 px tall to tap", () => {
    render(<ElegirAvatar avatares={AVATARES} elegido={null} alElegir={() => undefined} />)

    for (const radio of screen.getAllByRole("radio")) {
      expect(radio.closest("label")?.className).toContain("min-h-11")
    }
  })

  it("shows the name without a photo when the photo could not be signed", () => {
    render(
      <ElegirAvatar
        avatares={[{ id: "look-a", nombre: "Estudio", imagenUrl: null }]}
        elegido={null}
        alElegir={() => undefined}
      />,
    )

    expect(screen.getByRole("radio", { name: "Estudio" })).toBeInTheDocument()
    expect(screen.queryByRole("img")).not.toBeInTheDocument()
  })

  it("says plainly that there is nothing to choose, and offers no radios, when the list is empty", () => {
    render(<ElegirAvatar avatares={[]} elegido={null} alElegir={() => undefined} />)

    expect(screen.getByText("Todavía no hay avatares para elegir: avísale a Federico.")).toBeInTheDocument()
    expect(screen.queryByRole("radio")).not.toBeInTheDocument()
  })
})
