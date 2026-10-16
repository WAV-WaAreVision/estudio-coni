// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import RootLayout from "@/app/layout"
import { SCRIPT_DE_LETRA } from "@/lib/diseno/letra"

vi.mock("geist/font/sans", () => ({ GeistSans: { variable: "--font-geist-sans" } }))

describe("RootLayout", () => {
  it("runs the large-text check in the head, before the body paints", () => {
    const html = renderToStaticMarkup(
      <RootLayout>
        <p>hola</p>
      </RootLayout>,
    )
    const cabeza = html.slice(html.indexOf("<head>"), html.indexOf("</head>"))
    expect(cabeza).toContain(SCRIPT_DE_LETRA)
    expect(html.indexOf(SCRIPT_DE_LETRA)).toBeLessThan(html.indexOf("<body"))
  })
})
