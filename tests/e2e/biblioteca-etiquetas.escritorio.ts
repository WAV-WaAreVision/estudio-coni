import { expect, test } from "@playwright/test"
import { bloquearRedExterna, capturar, revisarConAxe } from "./ayudas"
import {
  type EscenaDeAutoresYTemas,
  type EscenaDeEtiquetas,
  sembrarAutoresYTemas,
  sembrarEtiquetas,
} from "./biblioteca-escena"
import { cajaDe, sobraDeAncho } from "./medidas-de-escritorio"

// Runs only in the `escritorio` project (1280 x 900 unless a describe below changes it).
let base: EscenaDeAutoresYTemas
let escena: EscenaDeEtiquetas

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await bloquearRedExterna(page)
  base = await sembrarAutoresYTemas()
  escena = await sembrarEtiquetas()
})

test("the claim's text sits left of its wider tags column, with the two networks side by side", async ({ page }) => {
  await page.goto(`/biblioteca/afirmaciones/${escena.nueva}`)
  await expect(page.locator("main h1")).toBeVisible()
  const texto = await cajaDe(page.getByTestId("pagina-principal"))
  const etiquetas = await cajaDe(page.getByTestId("pagina-etiquetas"))
  expect(texto.right).toBeLessThanOrEqual(etiquetas.left)
  expect(etiquetas.width).toBeGreaterThan(texto.width)
  const linkedin = await cajaDe(page.getByRole("region", { name: "LinkedIn" }))
  const instagram = await cajaDe(page.getByRole("region", { name: "Instagram" }))
  expect(linkedin.right).toBeLessThanOrEqual(instagram.left + 1)
  expect(Math.abs(linkedin.top - instagram.top)).toBeLessThan(2)

  await page.waitForLoadState("networkidle")
  await page.getByRole("button", { name: /^Emoción en LinkedIn/ }).click()
  await expect(page.getByRole("radio", { name: "Escepticismo" })).toBeChecked()
  expect(await revisarConAxe(page, "afirmación con una etiqueta abierta")).toEqual([])
})

for (const ancho of [375, 768, 1024, 1280]) {
  test.describe(`at ${ancho} px`, () => {
    test.use({ viewport: { width: ancho, height: 900 } })

    test(`a claim's page, an old one and an author's badges fit ${ancho} px, pass axe and are captured`, async ({
      page,
    }) => {
      await page.goto(`/biblioteca/afirmaciones/${escena.nueva}`)
      await expect(page.locator("main h1")).toBeVisible()
      await page.evaluate(() => document.fonts.ready)
      expect(await sobraDeAncho(page), `afirmación a ${ancho}`).toBeLessThanOrEqual(0)
      const texto = await cajaDe(page.getByTestId("pagina-principal"))
      const etiquetas = await cajaDe(page.getByTestId("pagina-etiquetas"))
      if (ancho >= 768) expect(texto.right, "dos columnas").toBeLessThanOrEqual(etiquetas.left)
      else expect(etiquetas.top, "una columna, el texto primero").toBeGreaterThanOrEqual(texto.bottom)
      expect(await revisarConAxe(page, `afirmación a ${ancho}`)).toEqual([])
      await capturar(page, `biblioteca-afirmacion-${ancho}`, { completa: true })

      await page.goto(`/biblioteca/afirmaciones/${escena.antigua}`)
      await expect(page.locator("main h1")).toBeVisible()
      expect(await sobraDeAncho(page), `afirmación antigua a ${ancho}`).toBeLessThanOrEqual(0)
      await capturar(page, `biblioteca-afirmacion-antigua-${ancho}`, { completa: true })

      await page.goto(`/biblioteca/autores/${base.autora}`)
      await expect(page.getByRole("link", { name: /Ver y corregir las etiquetas/ }).first()).toBeVisible()
      expect(await sobraDeAncho(page), `autor a ${ancho}`).toBeLessThanOrEqual(0)
      expect(await revisarConAxe(page, `autor con insignias a ${ancho}`)).toEqual([])
      await capturar(page, `biblioteca-autor-insignias-${ancho}`, { completa: true })
    })
  })
}
