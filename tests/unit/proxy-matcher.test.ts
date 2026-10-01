// @vitest-environment node
import { describe, expect, it } from "vitest"
import { config } from "../../proxy"

// Next reads `matcher` with path-to-regexp; this one is a single regex group, so it can be checked as one.
const patron = new RegExp(`^${config.matcher[0]}$`)
const pasaPorElProxy = (ruta: string) => patron.test(ruta)

describe("matcher del proxy", () => {
  it("leaves the public page and its redirect out: no session is read for them", () => {
    expect(pasaPorElProxy("/l")).toBe(false)
    expect(pasaPorElProxy("/l/ir/agenda")).toBe(false)
  })

  it("still guards every other page, including ones that merely start with the letter l", () => {
    for (const ruta of ["/", "/metricas", "/calendario", "/ajustes", "/ingreso", "/lista", "/libros/1", "/guion/abc"]) {
      expect(pasaPorElProxy(ruta)).toBe(true)
    }
  })

  it("keeps the manifest, the icons and Next's own files out as before", () => {
    for (const ruta of ["/_next/static/x.js", "/manifest.webmanifest", "/icon", "/apple-icon", "/favicon.ico"]) {
      expect(pasaPorElProxy(ruta)).toBe(false)
    }
  })

  it("serves the service worker without a session: the browser fetches it on its own, with no cookie to speak of", () => {
    expect(pasaPorElProxy("/sw.js")).toBe(false)
    expect(pasaPorElProxy("/sw.json")).toBe(true)
  })
})
