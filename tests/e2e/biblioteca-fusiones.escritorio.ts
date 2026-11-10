import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { expect, type Page, test } from "@playwright/test"
import { bloquearRedExterna, revisarConAxe } from "./ayudas"
import { sembrarAutoresYTemas, sembrarBorradores, sembrarFusiones, sembrarParRechazado } from "./biblioteca-escena"
import { cajaDe, sobraDeAncho } from "./medidas-de-escritorio"

// Runs only in the `escritorio` project (1280 x 900).
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await bloquearRedExterna(page)
  await sembrarFusiones(await sembrarAutoresYTemas())
  await sembrarParRechazado()
})

/** From the left edge of the leftmost card to the right edge of the rightmost one: the width the content really uses. */
function anchoDeLasTarjetas(page: Page): Promise<number> {
  return page.locator("main article").evaluateAll((tarjetas) => {
    const cajas = tarjetas.map((tarjeta) => tarjeta.getBoundingClientRect())
    return Math.max(...cajas.map((c) => c.right)) - Math.min(...cajas.map((c) => c.left))
  })
}

test("on the computer Fusiones uses the width: decisions beside the two lists, as wide as Borradores", async ({
  page,
}) => {
  await sembrarBorradores()
  await page.goto("/biblioteca/temas/borradores")
  const anchoDeBorradores = await anchoDeLasTarjetas(page)

  await page.goto("/biblioteca/temas/fusiones")
  expect(await revisarConAxe(page, "fusiones en el computador")).toEqual([])
  expect(await anchoDeLasTarjetas(page)).toBeGreaterThanOrEqual(anchoDeBorradores - 1)

  // «Para que decidas» on the left, the recent merges and the pairs not merged stacked on its right, from the same top.
  const decidir = await cajaDe(page.getByRole("region", { name: "Para que decidas" }))
  const recientes = await cajaDe(page.getByRole("region", { name: "Fusiones recientes" }))
  const rechazadas = await cajaDe(page.getByRole("region", { name: "Pares que no uní" }))
  expect(recientes.left).toBeGreaterThanOrEqual(decidir.right)
  expect(Math.abs(recientes.top - decidir.top)).toBeLessThanOrEqual(1)
  expect(rechazadas.left).toBeCloseTo(recientes.left, 0)
  expect(rechazadas.top).toBeGreaterThanOrEqual(recientes.bottom)
})

for (const ancho of [768, 1024, 1280]) {
  test(`Fusiones does not scroll sideways at ${ancho} px`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: 900 })
    await page.goto("/biblioteca/temas/fusiones")
    await expect(page.getByRole("heading", { name: "Fusiones", level: 1 })).toBeVisible()
    expect(await sobraDeAncho(page)).toBeLessThanOrEqual(0)
  })
}

test("review: Fusiones on the computer, saved for Federico", async ({ page }) => {
  const carpeta = process.env.VISUAL_FINALES
  test.skip(!carpeta, "New screen: no baseline until Federico approves it.")
  await page.goto("/biblioteca/temas/fusiones")
  await page.waitForLoadState("networkidle")
  await page.evaluate(() => document.fonts.ready)
  mkdirSync(carpeta ?? "", { recursive: true })
  await page.screenshot({ path: join(carpeta ?? "", "fusiones-escritorio.png"), fullPage: true })
})
