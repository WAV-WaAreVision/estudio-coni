import { expect, type Locator, type Page } from "@playwright/test"
import { capturar } from "./ayudas"

// Shared by the signing gates measured on a computer (*.escritorio.ts): boxes, sideways scroll, targets, focus order and
// the review captures. Not a spec itself: the escritorio project only runs files ending in `.escritorio.ts`.

export interface Caja {
  left: number
  right: number
  top: number
  bottom: number
  width: number
  height: number
}

export function cajaDe(elemento: Locator): Promise<Caja> {
  return elemento.evaluate((nodo) => {
    const r = nodo.getBoundingClientRect()
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }
  })
}

export const firmaDe = (page: Page) => page.getByRole("region", { name: "Firma" })

/** How many pixels the page scrolls sideways; 0 or less when it does not. */
export function sobraDeAncho(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
}

/** Headless Chromium hides scrollbars: the 15 px a classic one takes (Windows) come off the page instead. */
export async function conBarraClasica(page: Page): Promise<void> {
  await page.addStyleTag({ content: "html { padding-right: 15px }" })
}

/** A browser's text-only zoom: twice the text with the width unchanged; rem grows, the window does not. */
export async function conTextoDoble(page: Page): Promise<void> {
  await page.addStyleTag({ content: "html { font-size: 212.5% !important }" })
}

/** Every visible control of the main area under 44 px tall, by name. */
export function controlesBajos(page: Page): Promise<{ nombre: string | null; alto: number }[]> {
  return page.evaluate(() => {
    const controles = document.querySelectorAll<HTMLElement>(
      "main select, main button, main [role=slider], main label:has(input[type=radio]), main label:has(input[type=checkbox]), main a, main summary",
    )
    return [...controles]
      .filter((nodo) => nodo.offsetParent !== null)
      .map((nodo) => ({
        nombre: nodo.textContent?.trim() || nodo.getAttribute("aria-label"),
        alto: nodo.getBoundingClientRect().height,
      }))
      .filter(({ alto }) => alto < 44)
  })
}

/** The names the Tab key visits inside main, in order, from the top of the page. */
export async function ordenDeFoco(page: Page, pasos = 40): Promise<string[]> {
  const orden: string[] = []
  await page.locator("main").focus()
  for (let i = 0; i < pasos; i++) {
    await page.keyboard.press("Tab")
    const nombre = await page.evaluate(() => {
      const nodo = document.activeElement
      if (!nodo || !nodo.closest("main")) return null
      return (
        nodo.getAttribute("aria-label") ?? nodo.closest("label")?.textContent?.trim() ?? nodo.textContent?.trim() ?? ""
      )
    })
    if (nombre !== null) orden.push(nombre)
  }
  return orden
}

/** Each text appears in the focus order, and in this order. */
export function esperarEnOrden(orden: readonly string[], textos: readonly string[]): void {
  const posiciones = textos.map((texto) => orden.findIndex((nombre) => nombre.includes(texto)))
  expect(
    posiciones.every((posicion) => posicion >= 0),
    `${textos.join(" > ")}\n${orden.join(" | ")}`,
  ).toBe(true)
  expect(
    [...posiciones].sort((a, b) => a - b),
    orden.join(" | "),
  ).toEqual(posiciones)
}

/**
 * The review captures of a gate (into CAPTURAS_E2E): the 1280 x 900 and 1440 x 900 windows as she sees them, the
 * whole page at 1024, and the whole page with twice the text at 1280. `abrir` loads the screen at the current size.
 */
export async function capturarPuerta(page: Page, nombre: string, abrir: () => Promise<void>): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 900 })
  await abrir()
  await capturar(page, `${nombre}-1280`)
  await page.setViewportSize({ width: 1440, height: 900 })
  await abrir()
  await capturar(page, `${nombre}-1440`)
  await page.setViewportSize({ width: 1024, height: 900 })
  await abrir()
  await capturar(page, `${nombre}-1024-completa`, { completa: true })
  await page.setViewportSize({ width: 1280, height: 900 })
  await abrir()
  await conTextoDoble(page)
  await page.evaluate(() => window.scrollTo(0, 0))
  await capturar(page, `${nombre}-letra-grande-1280`, { completa: true })
}
