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

  it("keeps Inicio current inside the script and video screens that open from it", () => {
    usePathname.mockReturnValue("/guion/abc")
    render(<NavInferior />)

    expect(screen.getByRole("link", { name: "Inicio" })).toHaveAttribute("aria-current", "page")
  })
})
