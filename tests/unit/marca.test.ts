// @vitest-environment node
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"
import { viewport } from "@/app/layout"
import {
  COLOR_DE_FIRMA,
  COLOR_DE_FONDO,
  COLOR_DE_FONDO_OSCURO,
  COLOR_DE_TINTA,
  COLOR_SOBRE_FIRMA,
} from "@/lib/diseno/marca"

// next/font only exists inside the Next build; the font is a third-party boundary.
vi.mock("geist/font/sans", () => ({ GeistSans: { variable: "--font-geist-sans" } }))

const css = readFileSync(join(__dirname, "..", "..", "app", "globals.css"), "utf-8")

describe("brand constants", () => {
  it("repeat the page colours and the signature of globals.css", () => {
    expect(css).toContain(`--fondo: ${COLOR_DE_FONDO}`)
    expect(css).toContain(`--fondo: ${COLOR_DE_FONDO_OSCURO}`)
    expect(css).toContain(`--firma: ${COLOR_DE_FIRMA}`)
    expect(css).toContain(`--superficie: ${COLOR_SOBRE_FIRMA}`)
    expect(css).toContain(`--tinta: ${COLOR_DE_TINTA}`)
  })

  it("tells iOS the app is light only, with the stone page colour", () => {
    expect(viewport.colorScheme).toBe("light")
    expect(viewport.themeColor).toBe(COLOR_DE_FONDO)
  })
})
