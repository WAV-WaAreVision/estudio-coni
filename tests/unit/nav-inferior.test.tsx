import { render, screen } from "@testing-library/react"
import type { ComponentProps } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { NavInferior } from "@/components/nav-inferior"

const usePathname = vi.hoisted(() => vi.fn<() => string>())
vi.mock("next/navigation", () => ({ usePathname }))
vi.mock("next/link", () => ({
  // Marks every Next <Link>: the tabs that leave the app must stay plain links (a <Link> would prefetch and mint).
  default: ({ children, ...props }: ComponentProps<"a">) => (
    <a data-next-link="" {...props}>
      {children}
    </a>
  ),
}))

describe("NavInferior", () => {
  beforeEach(() => {
    usePathname.mockReturnValue("/")
  })

  it("has the four tabs of the design, the Biblioteca last", () => {
    render(<NavInferior />)

    const enlaces = screen.getAllByRole("link").map((enlace) => enlace.textContent)

    expect(enlaces).toEqual(["Inicio", "Métricas", "Ajustes", "Biblioteca"])
    expect(screen.getByRole("navigation", { name: "Secciones" })).toHaveClass("grid-cols-4")
  })

  it("leaves the app for the Biblioteca and never marks it current", () => {
    usePathname.mockReturnValue("/ir-a-biblioteca")
    render(<NavInferior />)

    const biblioteca = screen.getByRole("link", { name: "Biblioteca" })
    expect(biblioteca).toHaveAttribute("href", "/ir-a-biblioteca")
    expect(biblioteca).not.toHaveAttribute("aria-current")
    expect(biblioteca).toHaveClass("text-apagado", "min-h-nav")
  })

  it("keeps the Biblioteca a plain link while the tabs inside the app stay Next links", () => {
    render(<NavInferior />)

    expect(screen.getByRole("link", { name: "Biblioteca" })).not.toHaveAttribute("data-next-link")
    expect(screen.getByRole("link", { name: "Inicio" })).toHaveAttribute("data-next-link")
  })

  it("marks the current tab", () => {
    usePathname.mockReturnValue("/ajustes")
    render(<NavInferior />)

    expect(screen.getByRole("link", { name: "Ajustes" })).toHaveAttribute("aria-current", "page")
    expect(screen.getByRole("link", { name: "Inicio" })).not.toHaveAttribute("aria-current")
  })

  it.each(["/ideas", "/ideas/nueva", "/calendario"])("keeps Inicio current on %s, which hang from it", (ruta) => {
    usePathname.mockReturnValue(ruta)
    render(<NavInferior />)

    expect(screen.getByRole("link", { name: "Inicio" })).toHaveAttribute("aria-current", "page")
  })

  it.each(["/guion/abc", "/video/abc"])(
    "steps aside on %s so the approve bar owns the bottom of the screen",
    (ruta) => {
      usePathname.mockReturnValue(ruta)
      render(<NavInferior />)

      expect(screen.queryByRole("navigation")).not.toBeInTheDocument()
    },
  )

  it("is raised on piedra and draws the current tab as a sunken honda pill", () => {
    render(<NavInferior />)
    expect(screen.getByRole("navigation", { name: "Secciones" })).toHaveClass(
      "bg-piedra",
      "shadow-relieve-fijo",
      "rounded-t-panel",
    )
    expect(screen.getByRole("link", { name: "Inicio" })).toHaveClass(
      "bg-piedra-honda",
      "shadow-hundido",
      "font-semibold",
      "min-h-nav",
    )
    expect(screen.getByRole("link", { name: "Ajustes" })).toHaveClass("text-apagado")
    expect(screen.getByText("Inicio")).toHaveClass("nav-etiqueta")
  })
})
