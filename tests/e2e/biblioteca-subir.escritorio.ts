import { expect, test } from "@playwright/test"
import { pool } from "../integration/db"
import { bloquearRedExterna, disparosDeMateriales, limpiarDisparos, revisarConAxe } from "./ayudas"
import { AUTORA, CREDENCIAL, sembrarBiblioteca } from "./biblioteca-escena"

// Runs only in the `escritorio` project: a computer, 1280 x 900.
const PDF = Buffer.from("%PDF-1.4\n%%EOF\n")

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await bloquearRedExterna(page)
  await sembrarBiblioteca()
  limpiarDisparos()
})

test("on a computer Subir reads in one column as wide as a material's detail, and uploads a PDF", async ({ page }) => {
  const titulo = "Apego adulto desde el computador"
  await page.goto("/biblioteca/subir")
  const formulario = page.getByRole("form", { name: "Subir material" })
  await expect(formulario).toBeVisible()
  const raiz = await page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize))
  expect((await formulario.boundingBox())?.width ?? 0).toBeLessThanOrEqual(42 * raiz + 1)

  const selector = page.waitForEvent("filechooser")
  await page.getByRole("button", { name: "Elegir archivo" }).click()
  await (await selector).setFiles({ name: "apego.pdf", mimeType: "application/pdf", buffer: PDF })
  await page.getByLabel(/^Título/).fill(titulo)
  await page.getByLabel("Autor", { exact: true }).fill("Daniela")
  await page.getByRole("button", { name: `${AUTORA}, ${CREDENCIAL}` }).click()
  await page.getByRole("radio", { name: "Referente" }).check()
  await page.getByRole("checkbox", { name: "Este material no contiene datos de pacientes" }).check()
  await page.getByRole("button", { name: "Subir", exact: true }).click()

  await expect(page).toHaveURL(/\/biblioteca\?subido=1$/)
  await expect(page.getByText("Lo estoy procesando.")).toBeVisible()
  await expect(page.getByRole("table", { name: "Materiales" })).toContainText(titulo)
  const { rows } = await pool.query<{ id: string }>("select id from public.materiales where titulo = $1", [titulo])
  expect(disparosDeMateriales().map((disparo) => disparo.materialId)).toEqual(rows.map((fila) => fila.id))
})

test("Subir on a computer passes WCAG 2.x AA", async ({ page }) => {
  await page.goto("/biblioteca/subir")
  await expect(page.getByRole("form", { name: "Subir material" })).toBeVisible()
  expect(await revisarConAxe(page, "subir en el computador")).toEqual([])
})
