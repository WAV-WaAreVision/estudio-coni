import { afterEach, describe, expect, it } from "vitest"
import { ANCHO_MINIMO_EN_REM, esLetraGrande, SCRIPT_DE_LETRA } from "@/lib/diseno/letra"

function anchoDeVentana(px: number) {
  Object.defineProperty(window, "innerWidth", { value: px, configurable: true, writable: true })
}

afterEach(() => {
  document.documentElement.removeAttribute("data-letra")
  document.documentElement.style.fontSize = ""
})

describe("esLetraGrande", () => {
  it("switches below 18 rem across", () => {
    expect(ANCHO_MINIMO_EN_REM).toBe(18)
    expect(esLetraGrande(390, 17)).toBe(false)
    expect(esLetraGrande(390, 23)).toBe(true)
    expect(esLetraGrande(375, 21)).toBe(true)
  })

  it("never switches on a root it cannot read", () => {
    expect(esLetraGrande(390, 0)).toBe(false)
  })
})

describe("SCRIPT_DE_LETRA", () => {
  it("marks the root with data-letra=grande on the same arithmetic, and clears it when the text gets smaller", () => {
    anchoDeVentana(390)
    document.documentElement.style.fontSize = "23px"
    new Function(SCRIPT_DE_LETRA)()
    expect(document.documentElement.dataset.letra).toBe("grande")

    document.documentElement.style.fontSize = "17px"
    window.dispatchEvent(new Event("resize"))
    expect(document.documentElement.dataset.letra).toBeUndefined()
  })

  it("checks again when the app comes back to the screen", () => {
    anchoDeVentana(390)
    document.documentElement.style.fontSize = "17px"
    new Function(SCRIPT_DE_LETRA)()
    expect(document.documentElement.dataset.letra).toBeUndefined()

    document.documentElement.style.fontSize = "24px"
    document.dispatchEvent(new Event("visibilitychange"))
    expect(document.documentElement.dataset.letra).toBe("grande")
  })
})
