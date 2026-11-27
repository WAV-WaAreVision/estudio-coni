import { expect, test } from "@playwright/test"
import { bloquearRedExterna, capturar, revisarConAxe } from "./ayudas"
import { sembrarAutoresYTemas, sembrarLoteDeEtiquetas, sinEtiquetasDudosas } from "./biblioteca-escena"
import { cajaDe, sobraDeAncho } from "./medidas-de-escritorio"

// Runs only in the `escritorio` project; each describe sets its width.
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await bloquearRedExterna(page)
  await sembrarAutoresYTemas()
  await sembrarLoteDeEtiquetas()
})

test.afterEach(() => sinEtiquetasDudosas())

for (const ancho of [375, 768, 1024, 1280]) {
  test.describe(`at ${ancho} px`, () => {
    test.use({ viewport: { width: ancho, height: 900 } })

    test(`the batch fits ${ancho} px, takes two columns from 1024, passes axe and is captured`, async ({ page }) => {
      await page.goto("/biblioteca/etiquetas/revisar")
      await expect(page.getByRole("heading", { level: 1, name: "Etiquetas para revisar" })).toBeVisible()
      await page.evaluate(() => document.fonts.ready)
      expect(await sobraDeAncho(page), `lote a ${ancho}`).toBeLessThanOrEqual(0)
      const tarjetas = page.getByRole("article")
      await expect(tarjetas).toHaveCount(3)
      const primera = await cajaDe(tarjetas.nth(0))
      const segunda = await cajaDe(tarjetas.nth(1))
      if (ancho >= 1024) {
        expect(segunda.left, "dos columnas").toBeGreaterThanOrEqual(primera.right)
        expect(Math.abs(segunda.top - primera.top), "misma fila").toBeLessThan(2)
      } else {
        expect(segunda.top, "una columna").toBeGreaterThanOrEqual(primera.bottom)
      }
      expect(await revisarConAxe(page, `lote a ${ancho}`)).toEqual([])
      await capturar(page, `biblioteca-etiquetas-revisar-${ancho}`, { completa: true })

      await page.waitForLoadState("networkidle")
      await page.getByRole("article").nth(2).getByRole("button", { name: "Cambiar" }).click()
      await expect(page.getByRole("article").nth(2).getByRole("radio").first()).toBeVisible()
      expect(await sobraDeAncho(page), `lote con la lista abierta a ${ancho}`).toBeLessThanOrEqual(0)
      expect(await revisarConAxe(page, `lote con la lista abierta a ${ancho}`)).toEqual([])
      await capturar(page, `biblioteca-etiquetas-revisar-abierta-${ancho}`, { completa: true })
    })
  })
}
