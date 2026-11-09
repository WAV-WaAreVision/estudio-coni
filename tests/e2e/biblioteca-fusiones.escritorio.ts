import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { expect, test } from "@playwright/test"
import { bloquearRedExterna, revisarConAxe } from "./ayudas"
import { sembrarAutoresYTemas, sembrarFusiones } from "./biblioteca-escena"

// Runs only in the `escritorio` project (1280 x 900).
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await bloquearRedExterna(page)
  await sembrarFusiones(await sembrarAutoresYTemas())
})

test("on the computer Fusiones uses the main column, cards side by side, and passes axe", async ({ page }) => {
  await page.goto("/biblioteca/temas/fusiones")
  expect(await revisarConAxe(page, "fusiones en el computador")).toEqual([])
  const columna = await page
    .getByRole("heading", { name: "Fusiones", level: 1 })
    .evaluate((h) => h.parentElement?.getBoundingClientRect().width ?? 0)
  expect(columna).toBeGreaterThan(700)
})

test("review: Fusiones on the computer, saved for Federico", async ({ page }) => {
  const carpeta = process.env.VISUAL_FINALES
  test.skip(!carpeta, "New screen: no baseline until Federico approves it.")
  await page.goto("/biblioteca/temas/fusiones")
  await page.waitForLoadState("networkidle")
  await page.evaluate(() => document.fonts.ready)
  mkdirSync(carpeta ?? "", { recursive: true })
  await page.screenshot({ path: join(carpeta ?? "", "fusiones-escritorio.png"), fullPage: true })
})
