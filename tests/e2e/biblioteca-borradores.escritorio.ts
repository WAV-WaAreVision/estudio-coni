import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { expect, type Page, test } from "@playwright/test"
import { bloquearRedExterna, revisarConAxe, tocarHastaLlegar } from "./ayudas"
import { BORRADOR_DE_INSTAGRAM, sembrarAutoresYTemas, sembrarBorradores } from "./biblioteca-escena"

// Runs only in the `escritorio` project (1280 x 900).
let borradores: { pilar: string; red: string }

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await bloquearRedExterna(page)
  await sembrarAutoresYTemas()
  borradores = await sembrarBorradores()
})

test("on the computer a pillar draft is approved from Borradores and opens Temas' table on it", async ({ page }) => {
  await page.goto("/biblioteca/temas?red=instagram")
  expect(await revisarConAxe(page, "temas con agregar en el computador")).toEqual([])
  await tocarHastaLlegar(page, page.getByRole("link", { name: "Borradores · 2" }), /\/biblioteca\/temas\/borradores$/)
  expect(await revisarConAxe(page, "borradores en el computador")).toEqual([])
  await tocarHastaLlegar(
    page,
    page.getByRole("article", { name: BORRADOR_DE_INSTAGRAM.nombre }).getByRole("link", { name: "Aprobar" }),
    new RegExp(`/borradores/${borradores.pilar}/aprobar$`),
  )
  // Instagram: 35 + 40 + 25, plus the draft's 10.
  await expect(page.getByRole("status").filter({ hasText: "Total:" })).toHaveText("Total: 110 %")
  expect(await revisarConAxe(page, "aprobar pilar en el computador")).toEqual([])
  await page.getByRole("button", { name: "Aprobar pilar" }).click()
  await expect(page).toHaveURL(/\/biblioteca\/temas\?red=instagram&pilar=[0-9a-f-]{36}(?:&v=\d+)?$/)
  await expect(page.getByRole("list", { name: "Pilares de Instagram" }).getByRole("link")).toHaveText([
    "Todos los pilares",
    "Game Over Impostora",
    "Mi nueva partida",
    "Inteligencia emocional",
    BORRADOR_DE_INSTAGRAM.nombreCorto,
    "Agregar pilar",
    "Capa TDAH",
  ])
  await expect(page.getByText("Ningún tema coincide con esos filtros.")).toBeVisible()
})

async function capturaDeEscritorio(page: Page, nombre: string): Promise<void> {
  await page.waitForLoadState("networkidle")
  await page.evaluate(() => document.fonts.ready)
  const carpeta = process.env.VISUAL_FINALES
  if (carpeta) {
    mkdirSync(carpeta, { recursive: true })
    await page.screenshot({ path: join(carpeta, nombre), fullPage: true })
    return
  }
  await expect(page).toHaveScreenshot(nombre, { fullPage: true })
}

test("visual: Borradores and a pillar's approval on the computer", async ({ page }) => {
  await page.goto("/biblioteca/temas/borradores")
  await expect(page.getByRole("heading", { name: "Borradores", level: 1 })).toBeVisible()
  await capturaDeEscritorio(page, "biblioteca-borradores-escritorio.png")
  await page.goto(`/biblioteca/temas/borradores/${borradores.pilar}/aprobar`)
  await expect(page.getByRole("status").filter({ hasText: "Total:" })).toHaveText("Total: 110 %")
  await capturaDeEscritorio(page, "biblioteca-aprobar-pilar-escritorio.png")
})
