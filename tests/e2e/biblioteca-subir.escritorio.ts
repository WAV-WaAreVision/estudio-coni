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

test("on a computer Subir puts what she uploads beside how it gets filed, and uploads a PDF", async ({ page }) => {
  const titulo = "Apego adulto desde el computador"
  await page.goto("/biblioteca/subir")
  const formulario = page.getByRole("form", { name: "Subir material" })
  await expect(formulario).toBeVisible()
  const raiz = await page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize))
  // The Biblioteca's width (76rem less the page's gutters), not a narrow reading column.
  expect((await formulario.boundingBox())?.width ?? 0).toBeGreaterThan(60 * raiz)
  const campo = page.getByLabel("Pega un enlace o elige un archivo")
  const caja = await campo.boundingBox()
  const boton = await page.getByRole("button", { name: "Subir", exact: true }).boundingBox()
  if (!caja || !boton) throw new Error("Falta el campo o el botón Subir")
  expect(boton.x).toBeGreaterThanOrEqual(caja.x + caja.width)
  expect(boton.y).toBeLessThan(900)
  // No native corner grip: it looks like every other field.
  expect(await campo.evaluate((elemento) => getComputedStyle(elemento).resize)).toBe("none")

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

test("on a computer the actions stay in view while a YouTube transcript grows the left column", async ({ page }) => {
  await page.goto("/biblioteca/subir")
  await page.getByLabel("Pega un enlace o elige un archivo").fill("https://www.youtube.com/watch?v=abc123")
  const transcripcion = page.getByLabel("Transcripción del video")
  await transcripcion.fill("Una línea de la transcripción.\n".repeat(80))
  expect(await transcripcion.evaluate((elemento) => getComputedStyle(elemento).resize)).toBe("none")
  // Halfway down the transcript the top of the form is long gone: only a sticky column still shows Subir.
  await transcripcion.evaluate((elemento) => {
    const caja = elemento.getBoundingClientRect()
    window.scrollTo(0, window.scrollY + caja.top + caja.height / 2)
  })
  await expect(page.getByLabel("Pega un enlace o elige un archivo")).not.toBeInViewport()
  await expect(page.getByRole("button", { name: "Subir", exact: true })).toBeInViewport()
  // The upload side comes before the filing side in the DOM, so the focus and a screen reader meet it first.
  const orden = await page.evaluate(() => {
    const campo = document.querySelector("textarea")
    const subir = document.querySelector('button[type="submit"]')
    return campo && subir ? campo.compareDocumentPosition(subir) & Node.DOCUMENT_POSITION_FOLLOWING : 0
  })
  expect(orden).not.toBe(0)
})
