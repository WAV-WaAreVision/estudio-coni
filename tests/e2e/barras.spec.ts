import { expect, type Locator, test } from "@playwright/test"
import { abrirDesplegable, bloquearRedExterna, configurarServicios, simularMedios } from "./ayudas"
import { sembrarEscena } from "./escena"

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await bloquearRedExterna(page)
  await configurarServicios()
  await simularMedios(page)
})

async function caja(elemento: Locator) {
  const medida = await elemento.boundingBox()
  if (!medida) throw new Error("El elemento no está en pantalla")
  return medida
}

test("the sign bar stays at the bottom of the screen while the script scrolls", async ({ page }) => {
  const { guion } = await sembrarEscena()
  await page.goto(`/guion/${guion}`)
  const alto = page.viewportSize()?.height ?? 0
  // The screen streams in after its loading state: the page is only tall once the bar is there.
  await expect(page.locator("[data-barra-de-firma]")).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight)).toBe(true)

  for (const y of [0, 400]) {
    await page.evaluate((destino) => window.scrollTo(0, destino), y)
    const barra = await caja(page.locator("[data-barra-de-firma]"))
    expect(Math.abs(barra.y + barra.height - alto), `scroll ${y}`).toBeLessThanOrEqual(1)
  }
})

test("on a signing screen the toast sits at the top and never covers the sign bar", async ({ page }) => {
  const { guion } = await sembrarEscena()
  await page.goto(`/guion/${guion}?deshecho=1`)

  const aviso = page.locator(".aviso")
  await expect(aviso).toContainText("Listo, no grabé nada.")
  const toast = await caja(aviso)
  const barra = await caja(page.locator("[data-barra-de-firma]"))
  expect(toast.y).toBeGreaterThanOrEqual(0)
  expect(toast.y + toast.height).toBeLessThanOrEqual(barra.y)
})

test("on Inicio the toast sits above the bottom nav", async ({ page }) => {
  await sembrarEscena()
  await page.goto("/")
  await abrirDesplegable(page, "Consultas")
  await page.getByRole("button", { name: "Llegó una consulta" }).click()

  const aviso = page.locator(".aviso")
  await expect(aviso).toContainText(/^Anotada\./)
  const toast = await caja(aviso)
  const nav = await caja(page.getByRole("navigation", { name: "Secciones" }))
  expect(toast.y + toast.height).toBeLessThanOrEqual(nav.y)
})
