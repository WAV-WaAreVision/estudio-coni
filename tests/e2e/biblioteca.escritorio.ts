import { expect, test } from "@playwright/test"
import { bloquearRedExterna, disparosDeMateriales, limpiarDisparos, revisarConAxe } from "./ayudas"
import { AUTORA, CREDENCIAL, type EscenaDeBiblioteca, sembrarBiblioteca, TITULO_LISTO } from "./biblioteca-escena"

// Runs only in the `escritorio` project (D15): a computer, 1280 x 900.
let escena: EscenaDeBiblioteca

const PISTA = "Elige un material de la tabla para ver aquí sus ideas y quién es para ti."

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await bloquearRedExterna(page)
  escena = await sembrarBiblioteca()
  limpiarDisparos()
})

test("on a computer the column widens, and the table opens the side panel with ?m; Back closes it", async ({
  page,
}) => {
  await page.goto("/biblioteca")
  const ancho = await page.locator("[data-ancho=biblioteca]").evaluate((nodo) => nodo.getBoundingClientRect().width)
  expect(ancho).toBeGreaterThan(900)
  await expect(page.getByRole("list", { name: "Materiales" })).toBeHidden()

  const tabla = page.getByRole("table", { name: "Materiales" })
  await expect(tabla.getByRole("columnheader")).toHaveText(["Material", "Tipo", "Autor", "Tema", "Estado", "Subido"])
  await expect(page.getByText(PISTA)).toBeVisible()

  await tabla.getByRole("link", { name: TITULO_LISTO }).click()
  await expect(page).toHaveURL(new RegExp(`/biblioteca\\?m=${escena.listo}$`))
  const panel = page.getByRole("region", { name: TITULO_LISTO })
  // Opening from a row moves the focus to the panel's heading.
  await expect(panel.getByRole("heading", { name: TITULO_LISTO, level: 2 })).toBeFocused()
  await expect(tabla.getByRole("link", { name: TITULO_LISTO })).toHaveAttribute("aria-current", "true")
  await expect(panel.getByRole("heading", { name: "Ideas sacadas" })).toBeVisible()
  await expect(panel).toContainText("«El aislamiento pesa más que las horas extra.»")
  await expect(panel).toContainText(`${AUTORA} · ${CREDENCIAL}`)
  await expect(panel.getByText("Detalle para WAV")).toBeVisible()

  await page.goBack()
  await expect(page).toHaveURL(/\/biblioteca$/)
  await expect(page.getByText(PISTA)).toBeVisible()
  await expect(page.getByRole("region", { name: TITULO_LISTO })).toHaveCount(0)

  await tabla.getByRole("link", { name: TITULO_LISTO }).click()
  await panel.getByRole("link", { name: "Ver las 3" }).click()
  await expect(page).toHaveURL(new RegExp(`/biblioteca/materiales/${escena.listo}$`))
})

test("the panel closes with its own control, keeps the filter and gives the focus back to the row", async ({
  page,
}) => {
  await page.goto("/biblioteca?estado=listo")
  const fila = page.getByRole("table", { name: "Materiales" }).getByRole("link", { name: TITULO_LISTO })
  await fila.click()
  await expect(page).toHaveURL(new RegExp(`/biblioteca\\?estado=listo&m=${escena.listo}$`))
  await page.getByRole("link", { name: "Cerrar el panel" }).click()
  await expect(page).toHaveURL(/\/biblioteca\?estado=listo$/)
  await expect(page.getByText(PISTA)).toBeVisible()
  await expect(fila).toBeFocused()
})

test("a strategy material's panel shows its card's key ideas", async ({ page }) => {
  await page.goto(`/biblioteca?m=${escena.estrategia}`)
  const panel = page.getByRole("region", { name: "Plan de contenidos de noviembre" })
  await expect(panel.getByRole("heading", { name: "Ideas sacadas" })).toBeVisible()
  await expect(panel).toContainText("«Dos reels por semana sobre carga mental.»")
  await expect(panel.getByRole("link", { name: "Ver las 5" })).toBeVisible()
})

test("Reintentar in the side panel starts the run and the screen shows it working, without a reload", async ({
  page,
}) => {
  await page.goto(`/biblioteca?m=${escena.conError}`)
  const panel = page.getByRole("region", { name: "Notas del taller de TDAH adulto" })
  await panel.getByRole("button", { name: "Reintentar" }).click()
  await panel.getByRole("button", { name: "Sí, reintentar" }).click()
  await expect(panel.getByText("Procesando", { exact: true })).toBeVisible()
  await expect(panel.getByRole("button", { name: "Reintentar" })).toHaveCount(0)
  expect(disparosDeMateriales().map((disparo) => disparo.materialId)).toEqual([escena.conError])
})

test("the table and the side panel pass WCAG 2.x AA", async ({ page }) => {
  await page.goto(`/biblioteca?m=${escena.listo}`)
  await expect(page.getByRole("region", { name: TITULO_LISTO })).toBeVisible()
  expect(await revisarConAxe(page, "tabla y panel")).toEqual([])
  await page.getByText("Detalle para WAV").click()
  expect(await revisarConAxe(page, "panel con el detalle para WAV abierto")).toEqual([])
})
