import { expect, test } from "@playwright/test"
import { bloquearRedExterna, capturar, revisarConAxe, tocarHastaLlegar } from "./ayudas"
import { type EscenaDeGanchos, GANCHO_LINKEDIN, sembrarAutoresYTemas, sembrarGanchos } from "./biblioteca-escena"
import { cajaDe, sobraDeAncho } from "./medidas-de-escritorio"

// Runs only in the `escritorio` project (1280 x 900).
let ganchos: EscenaDeGanchos

const PISTA = "Elige un gancho de la tabla para ver aquí sus partes, de dónde viene y marcarlo como favorito."

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await bloquearRedExterna(page)
  await sembrarAutoresYTemas()
  ganchos = await sembrarGanchos()
})

test("Ganchos is a table; a row opens the hook in the sticky side panel with ?g, the star works there, and Back closes it", async ({
  page,
}) => {
  await page.goto("/biblioteca/ganchos")
  await expect(page.getByRole("list", { name: "Ganchos" })).toBeHidden()
  const tabla = page.getByRole("table", { name: "Ganchos" })
  await expect(tabla.getByRole("columnheader")).toHaveText(["Frase exacta", "Tipo", "Autor", "Tema", "Favorito"])
  await expect(page.getByText(PISTA)).toBeVisible()

  await tocarHastaLlegar(
    page,
    tabla.getByRole("link", { name: `«${GANCHO_LINKEDIN.frase}»` }),
    new RegExp(`/biblioteca/ganchos\\?g=${ganchos.linkedin}(?:&v=\\d+)?$`),
  )
  const panel = page.getByRole("region", { name: `«${GANCHO_LINKEDIN.frase}»` })
  await expect(panel.getByRole("heading", { level: 2 })).toBeFocused()
  await expect(panel).toContainText(GANCHO_LINKEDIN.sinGancho)
  await expect(page.getByRole("complementary", { name: "Gancho elegido" })).toHaveCSS("position", "sticky")

  await page.waitForLoadState("networkidle")
  await panel.getByRole("button", { name: "Favorito" }).click()
  await expect(panel.getByRole("button", { name: "Favorito" })).toHaveAttribute("aria-pressed", "true")
  await expect(tabla.getByRole("row").nth(1)).toContainText(GANCHO_LINKEDIN.frase)
  expect(await revisarConAxe(page, "ganchos con el panel abierto")).toEqual([])

  await page.goBack()
  await expect(page).toHaveURL(/\/biblioteca\/ganchos(?:\?v=\d+)?$/)
  await expect(page.getByText(PISTA)).toBeVisible()
})

for (const ancho of [375, 768, 1024, 1280]) {
  test.describe(`at ${ancho} px`, () => {
    test.use({ viewport: { width: ancho, height: 900 } })

    test(`the hooks list and a hook's page fit ${ancho} px, pass axe and are captured for review`, async ({ page }) => {
      const conPanel = ancho >= 768
      await page.goto(conPanel ? `/biblioteca/ganchos?g=${ganchos.linkedin}` : "/biblioteca/ganchos")
      await expect(page.locator("main h1")).toBeVisible()
      await page.evaluate(() => document.fonts.ready)
      expect(await sobraDeAncho(page), `lista a ${ancho}`).toBeLessThanOrEqual(0)
      if (conPanel) {
        const tabla = await cajaDe(page.getByRole("table", { name: "Ganchos" }))
        const panel = await cajaDe(page.getByRole("complementary", { name: "Gancho elegido" }))
        expect(tabla.right, "la tabla no se mete bajo el panel").toBeLessThanOrEqual(panel.left + 1)
        await expect(page.getByRole("region", { name: `«${GANCHO_LINKEDIN.frase}»` })).toBeVisible()
      } else {
        await expect(page.getByRole("list", { name: "Ganchos" })).toBeVisible()
      }
      expect(await revisarConAxe(page, `ganchos a ${ancho}`)).toEqual([])
      await capturar(page, `biblioteca-ganchos-${ancho}`, { completa: true })

      await page.goto(`/biblioteca/ganchos/${ganchos.antiguo}`)
      await expect(page.locator("main h1")).toBeVisible()
      expect(await sobraDeAncho(page), `página del gancho a ${ancho}`).toBeLessThanOrEqual(0)
      await capturar(page, `biblioteca-gancho-${ancho}`, { completa: true })
    })
  })
}
