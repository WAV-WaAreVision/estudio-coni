import { readFileSync } from "node:fs"
import { join } from "node:path"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { BarraDeLote } from "@/components/barra-de-lote"

const CSS = readFileSync(join(process.cwd(), "app/globals.css"), "utf-8")

describe("BarraDeLote", () => {
  it("is a named region that sticks, raised high, with what it holds", () => {
    render(
      <BarraDeLote titulo="Ideas elegidas">
        <button type="button">Hacer los guiones (2)</button>
      </BarraDeLote>,
    )
    const barra = screen.getByRole("region", { name: "Ideas elegidas" })
    expect(barra).toHaveAttribute("data-barra-de-lote")
    expect(barra).toHaveClass("barra-de-lote", "sticky", "shadow-relieve-alto")
    expect(screen.getByRole("button", { name: "Hacer los guiones (2)" })).toBeInTheDocument()
  })

  it("sits above the bottom nav, at the bottom on a desktop, and in the flow at large text", () => {
    expect(CSS).toMatch(/\.barra-de-lote\s*\{\s*bottom:\s*calc\(var\(--alto-nav\) \+ 8px\);/)
    expect(CSS).toMatch(/@media \(min-width: 768px\)\s*\{\s*\.barra-de-lote\s*\{\s*bottom:/)
    expect(CSS).toMatch(/html\[data-letra="grande"\] \.barra-de-lote\s*\{\s*position:\s*static;/)
  })
})
