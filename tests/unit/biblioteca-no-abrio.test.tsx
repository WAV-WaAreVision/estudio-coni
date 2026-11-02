import { render, screen } from "@testing-library/react"
import type { ComponentProps } from "react"
import { describe, expect, it, vi } from "vitest"
import BibliotecaNoAbrio from "@/app/(app)/biblioteca-no-abrio/page"

vi.mock("next/link", () => ({
  // Marks every Next <Link>: the tabs that leave the app must stay plain links (a <Link> would prefetch and mint).
  default: ({ children, ...props }: ComponentProps<"a">) => (
    <a data-next-link="" {...props}>
      {children}
    </a>
  ),
}))

describe("the page when the Biblioteca does not open", () => {
  it("says so in plain Spanish and offers to try again or go to Inicio", () => {
    render(<BibliotecaNoAbrio />)

    expect(screen.getByRole("heading", { level: 1, name: "Biblioteca" })).toBeInTheDocument()
    expect(document.body.textContent).toContain("No pude abrir la Biblioteca.")
    expect(document.body.textContent).toContain("Vuelve a intentarlo en un momento.")
    expect(screen.getByRole("link", { name: "Volver a intentar" })).toHaveAttribute("href", "/ir-a-biblioteca")
    expect(screen.getByRole("link", { name: "Ir a Inicio" })).toHaveAttribute("href", "/")
  })

  it("keeps Volver a intentar a plain link, so nothing prefetches the bridge", () => {
    render(<BibliotecaNoAbrio />)

    expect(screen.getByRole("link", { name: "Volver a intentar" })).not.toHaveAttribute("data-next-link")
    expect(screen.getByRole("link", { name: "Ir a Inicio" })).toHaveAttribute("data-next-link")
  })
})
