import { expect, test } from "@playwright/test"
import { pool } from "../integration/db"
import { URL_DE_LA_APP } from "./entorno"
import { publicarPaginaDeIa, quitarPaginaDeIa, TEXTO_DE_PRUEBA } from "./pagina-de-ia"

async function limpiar() {
  await quitarPaginaDeIa()
  await pool.query("delete from public.revisiones_de_inventario")
}

test.beforeEach(limpiar)
test.afterAll(limpiar)

test("Coni reads her data register from Ajustes and marks it reviewed", async ({ page }) => {
  await page.goto("/ajustes")
  await page.getByRole("link", { name: "Datos personales" }).click()

  await expect(page.getByRole("heading", { name: "Datos personales", level: 1 })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Tu rostro (biometría)" })).toBeVisible()
  await expect(page.getByText("HeyGen, Estados Unidos (por confirmar)")).toBeVisible()
  await expect(page.getByText(/^Todavía no la revisas\. Tu próxima revisión vence el /)).toBeVisible()

  await page.getByRole("button", { name: "Lo revisé" }).click()
  await expect(page.getByText("Quedó anotado. Gracias.")).toBeVisible()
  await page.reload()
  await expect(page.getByText(/^La revisaste por última vez el /)).toBeVisible()
})

test("Coni publishes WAV's draft and a visitor reads it on /l/ia, linked from /l", async ({ page, browser }) => {
  await page.goto("/ajustes/pagina-de-ia")
  await expect(page.getByText("Propuesta de WAV")).toBeVisible()
  await page.getByLabel("¿Por qué lo cambias?").fill("Primera versión")
  await page.getByRole("button", { name: "Publicar" }).click()
  await expect(page.getByText("Publicaste la versión 1.")).toBeVisible()

  const visitante = await browser.newContext({ baseURL: URL_DE_LA_APP, storageState: { cookies: [], origins: [] } })
  const publica = await visitante.newPage()
  await publica.emulateMedia({ colorScheme: "dark" })
  await publica.goto("/l/ia")
  await expect(publica.getByRole("heading", { name: "Cómo uso IA en mi contenido", level: 1 })).toBeVisible()
  await expect(publica.getByText(/^Algunos de mis reels los hace mi avatar digital/)).toBeVisible()
  await expect(publica.getByText(/^Actualizado el \d{1,2} de [a-z]+ de \d{4}\.$/)).toBeVisible()
  // Light theme even on a phone in dark mode, like the rest of the app.
  expect(await publica.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe("light")

  await publica.goto("/l")
  await expect(publica.getByRole("link", { name: "Cómo uso IA en mi contenido" })).toHaveAttribute("href", "/l/ia")
  await visitante.close()
})

test("/l/ia is a 404 and /l has no link to it before anything is published", async ({ page }) => {
  const respuesta = await page.goto("/l/ia")
  expect(respuesta?.status()).toBe(404)
  await expect(page.getByText("Esta página todavía no está publicada.")).toBeVisible()

  await page.goto("/l")
  await expect(page.getByRole("link", { name: "Cómo uso IA en mi contenido" })).toHaveCount(0)
})

test("going back to an earlier version publishes its text again", async ({ page }) => {
  await publicarPaginaDeIa(TEXTO_DE_PRUEBA, `${TEXTO_DE_PRUEBA}\n\nUna línea más.`)

  await page.goto("/ajustes/pagina-de-ia")
  await expect(page.getByText("Es la que se ve hoy.")).toBeVisible()
  await page.getByRole("button", { name: "Volver a esta" }).click()

  await expect(page.getByText("Volviste al texto de la versión 1: ahora es la versión 3.")).toBeVisible()
  const { rows } = await pool.query<{ version: number; texto: string }>(
    "select version, texto from public.transparencia_versiones where vigente",
  )
  expect(rows).toEqual([{ version: 3, texto: TEXTO_DE_PRUEBA }])
})
