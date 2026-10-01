import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { NavInferior } from "@/components/nav-inferior"

const usePathname = vi.hoisted(() => vi.fn<() => string>())
vi.mock("next/navigation", () => ({ usePathname }))

describe("NavInferior", () => {
  beforeEach(() => {
    usePathname.mockReturnValue("/")
  })

  it("has the three tabs of the design", () => {
    render(<NavInferior />)

    const enlaces = screen.getAllByRole("link").map((enlace) => enlace.textContent)

    expect(enlaces).toEqual(["Inicio", "Métricas", "Ajustes"])
  })

  it("marks the current tab", () => {
    usePathname.mockReturnValue("/ajustes")
    render(<NavInferior />)

    expect(screen.getByRole("link", { name: "Ajustes" })).toHaveAttribute("aria-current", "page")
    expect(screen.getByRole("link", { name: "Inicio" })).not.toHaveAttribute("aria-current")
  })

  it.each(["/guion/abc", "/video/abc"])(
    "steps aside on %s so the approve bar owns the bottom of the screen",
    (ruta) => {
      usePathname.mockReturnValue(ruta)
      render(<NavInferior />)

      expect(screen.queryByRole("navigation")).not.toBeInTheDocument()
    },
  )
})
