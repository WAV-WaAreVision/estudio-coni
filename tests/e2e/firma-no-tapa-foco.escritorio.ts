import { readFileSync } from "node:fs"
import { join } from "node:path"
import { expect, type Page, test } from "@playwright/test"
import { pool } from "../integration/db"
import { vaciarPiezasEIdeas } from "../integration/siembra"
import { bloquearRedExterna, configurarServicios, simularMedios } from "./ayudas"
import { avatarYaVisto, conAngulo, sembrarCarruselDeEscena, sembrarEscena } from "./escena"
import { cajaDe, firmaDe } from "./medidas-de-escritorio"

// Issue #78, WCAG 2.2 SC 2.4.11: a 1280 x 720 screen zoomed to 200 % is 640 x 360 CSS px, too short for two columns,
// so each gate falls back to the phone's column with the sign bar pinned at the bottom. Tabbing through the gate, the
// focused control must never sit under that bar.
test.use({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 2 })

const BASE = JSON.parse(readFileSync(join(__dirname, "..", "fixtures", "coni.config.json"), "utf-8"))

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await bloquearRedExterna(page)
  await pool.query("update public.ajustes set produccion = $1::jsonb", [JSON.stringify(BASE)])
  await configurarServicios()
  await simularMedios(page)
  await avatarYaVisto()
})

test.afterAll(async () => {
  await pool.query("update public.ajustes set produccion = '{}'::jsonb")
  await vaciarPiezasEIdeas()
})

/**
 * Tabs from the top of main to the bar and lists every control that ends up under the pinned bar. Fails when the walk
 * never reaches the bar or checks no control, so an empty list always means the whole gate was walked.
 */
async function tapadosPorLaFirma(page: Page): Promise<string[]> {
  const barra = firmaDe(page)
  await expect(barra).toHaveCSS("position", "sticky")
  await expect(barra).toHaveCSS("bottom", "0px")
  await page.locator("main").focus()
  const tapados: string[] = []
  let revisados = 0
  let llegoALaBarra = false
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press("Tab")
    const foco = await page.evaluate(() => {
      const nodo = document.activeElement as HTMLElement | null
      if (!nodo || !nodo.closest("main")) return null
      const barra = document.querySelector("[data-barra-de-firma]")
      const caja = nodo.getBoundingClientRect()
      return {
        nombre: nodo.getAttribute("aria-label") ?? nodo.textContent?.trim().slice(0, 40) ?? nodo.tagName,
        enLaBarra: Boolean(barra?.contains(nodo)),
        arriba: caja.top,
        abajo: caja.bottom,
      }
    })
    if (!foco) continue
    if (foco.enLaBarra) {
      llegoALaBarra = true
      break
    }
    revisados++
    const arribaDeLaBarra = (await cajaDe(barra)).top
    // A control taller than the room above the bar (the slide rail) cannot fit whole: its start shows above the bar.
    const cabe = foco.abajo - foco.arriba <= arribaDeLaBarra
    const visible = cabe
      ? foco.arriba >= -0.5 && foco.abajo <= arribaDeLaBarra + 0.5
      : foco.arriba >= -0.5 && foco.arriba < arribaDeLaBarra
    if (!visible) tapados.push(`${foco.nombre}: ${foco.arriba}..${foco.abajo}, bar at ${arribaDeLaBarra}`)
  }
  expect(llegoALaBarra, "Tab never reached the sign bar").toBe(true)
  expect(revisados, "no control above the bar took the focus").toBeGreaterThan(0)
  return tapados
}

test("gate 1 of a script: no focused control hides under the pinned sign bar", async ({ page }) => {
  const { guion } = await sembrarEscena()
  await conAngulo(guion, "psicologia-en-la-mesa", "lo-que-construyo")
  await page.goto(`/guion/${guion}`)
  await expect(page.getByRole("heading", { name: "2. Revisa el guion" })).toBeVisible()
  expect(await tapadosPorLaFirma(page)).toEqual([])
})

test("gate 2 of a video: no focused control hides under the pinned sign bar", async ({ page }) => {
  const { video } = await sembrarEscena()
  await page.goto(`/video/${video}`)
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  expect(await tapadosPorLaFirma(page)).toEqual([])
})

test("gate 1 of a carousel: no focused control hides under the pinned sign bar", async ({ page }) => {
  await vaciarPiezasEIdeas()
  const carrusel = await sembrarCarruselDeEscena("guion_por_aprobar")
  await conAngulo(carrusel, "psicologia-en-la-mesa", "lo-que-construyo")
  await page.goto(`/guion/${carrusel}`)
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  expect(await tapadosPorLaFirma(page)).toEqual([])
})

test("gate 2 of a carousel: no focused control hides under the pinned sign bar", async ({ page }) => {
  await vaciarPiezasEIdeas()
  const carrusel = await sembrarCarruselDeEscena("carrusel_por_aprobar")
  await page.goto(`/guion/${carrusel}`)
  await expect(page.getByRole("img", { name: /^Lámina 1 de 6/ })).toBeVisible()
  expect(await tapadosPorLaFirma(page)).toEqual([])
})
