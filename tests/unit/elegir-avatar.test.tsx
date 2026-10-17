import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ElegirAvatar } from "@/components/elegir-avatar"

const AVATARES = [
  { id: "look-a", nombre: "Estudio", imagenUrl: "https://almacen.test/avatares/look-a.jpg" },
  { id: "look-b", nombre: "Terraza", imagenUrl: "https://almacen.test/avatares/look-b.jpg" },
]

describe("ElegirAvatar", () => {
  it("offers every look as a radio row named by the look, in a group named Avatar, none chosen", () => {
    render(<ElegirAvatar avatares={AVATARES} elegido={null} alElegir={() => undefined} />)
    expect(screen.getByRole("group", { name: "Avatar" })).toBeInTheDocument()
    expect(screen.getAllByRole("radio").map((radio) => radio.closest("label")?.textContent)).toEqual([
      "Estudio",
      "Terraza",
    ])
    expect(screen.getAllByRole("radio").some((radio) => (radio as HTMLInputElement).checked)).toBe(false)
  })

  it("shows each photo as a 2.25rem round decoration beside its name", () => {
    const { container } = render(<ElegirAvatar avatares={AVATARES} elegido={null} alElegir={() => undefined} />)
    const fotos = container.querySelectorAll("img")
    expect(fotos).toHaveLength(2)
    expect(fotos[0]).toHaveAttribute("alt", "")
    expect(fotos[0]).toHaveAttribute("src", AVATARES[0]?.imagenUrl)
    expect(fotos[0]).toHaveClass("size-foto", "rounded-full")
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

  it("makes every row at least 2.75rem tall to tap", () => {
    render(<ElegirAvatar avatares={AVATARES} elegido={null} alElegir={() => undefined} />)
    for (const radio of screen.getAllByRole("radio")) expect(radio.closest("label")).toHaveClass("min-h-objetivo")
  })

  it("shows the name without a photo when the photo could not be signed", () => {
    const { container } = render(
      <ElegirAvatar
        avatares={[{ id: "look-a", nombre: "Estudio", imagenUrl: null }]}
        elegido={null}
        alElegir={() => undefined}
      />,
    )
    expect(screen.getByRole("radio", { name: "Estudio" })).toBeInTheDocument()
    expect(container.querySelector("img")).toBeNull()
  })
})
