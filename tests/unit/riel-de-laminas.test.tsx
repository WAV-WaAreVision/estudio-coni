import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { RielDeLaminas } from "@/app/(app)/guion/[id]/riel-de-laminas"

const LAMINAS = [
  { texto: "Portada", url: "https://almacen.test/1.png" },
  { texto: "Idea", url: "https://almacen.test/2.png" },
  { texto: "Cierre", url: null },
]

describe("RielDeLaminas", () => {
  it("shows every slide with its words as the image's name", () => {
    render(<RielDeLaminas laminas={LAMINAS} alVerTodas={() => {}} />)
    expect(screen.getByRole("img", { name: "Lámina 1 de 3: Portada" })).toHaveAttribute(
      "src",
      "https://almacen.test/1.png",
    )
    expect(screen.getByRole("img", { name: "Lámina 3 de 3: Cierre" })).toBeInTheDocument()
    expect(screen.getByText("Lámina 1 de 3")).toBeInTheDocument()
  })

  it("says when she reached the last slide, once", () => {
    const alVerTodas = vi.fn()
    render(<RielDeLaminas laminas={LAMINAS} alVerTodas={alVerTodas} />)
    fireEvent.click(screen.getByRole("button", { name: "Lámina siguiente" }))
    expect(alVerTodas).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Lámina siguiente" }))
    expect(screen.getByText("Lámina 3 de 3")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Lámina siguiente" })).toHaveAttribute("aria-disabled", "true")
    fireEvent.click(screen.getByRole("button", { name: "Lámina anterior" }))
    fireEvent.click(screen.getByRole("button", { name: "Lámina siguiente" }))
    expect(alVerTodas).toHaveBeenCalledTimes(1)
  })
})
