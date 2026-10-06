import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { MomentoDeCierre } from "@/components/momento-de-cierre"

describe("MomentoDeCierre", () => {
  it("says what happened with a quiet check, a 24 px title and its detail", () => {
    render(<MomentoDeCierre titulo="Ya se publicó" detalle="La etiqueta de IA quedó puesta en Instagram." />)
    expect(screen.getByText("Ya se publicó")).toHaveClass("text-pieza")
    expect(screen.getByText("La etiqueta de IA quedó puesta en Instagram.")).toBeInTheDocument()
  })

  it("links to Instagram in a new tab only when there is a link", () => {
    const { rerender } = render(<MomentoDeCierre titulo="Ya se publicó" />)
    expect(screen.queryByRole("link")).toBeNull()
    rerender(<MomentoDeCierre titulo="Ya se publicó" enlace="https://www.instagram.com/reel/abc/" />)
    const enlace = screen.getByRole("link", { name: "Ver en Instagram" })
    expect(enlace).toHaveAttribute("href", "https://www.instagram.com/reel/abc/")
    expect(enlace).toHaveAttribute("target", "_blank")
    expect(enlace).toHaveAttribute("rel", expect.stringContaining("noopener"))
  })

  it("links to every network she uploaded to, each in its own words", () => {
    render(
      <MomentoDeCierre
        titulo="Subido a mano"
        enlaces={[
          { etiqueta: "Ver en Instagram", href: "https://www.instagram.com/reel/abc/" },
          { etiqueta: "Ver en LinkedIn", href: "https://www.linkedin.com/posts/coni_abc" },
        ]}
      />,
    )
    expect(screen.getByRole("link", { name: "Ver en Instagram" })).toHaveAttribute(
      "href",
      "https://www.instagram.com/reel/abc/",
    )
    const linkedin = screen.getByRole("link", { name: "Ver en LinkedIn" })
    expect(linkedin).toHaveAttribute("href", "https://www.linkedin.com/posts/coni_abc")
    expect(linkedin).toHaveAttribute("target", "_blank")
    expect(linkedin).toHaveAttribute("rel", expect.stringContaining("noopener"))
  })
})
