import { expect, test } from "@playwright/test"
import { pool } from "../integration/db"
import { bloquearRedExterna, disparosDeMateriales, limpiarDisparos, revisarConAxe, tocarHastaLlegar } from "./ayudas"
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

  await tocarHastaLlegar(
    page,
    tabla.getByRole("link", { name: TITULO_LISTO }),
    new RegExp(`/biblioteca\\?m=${escena.listo}(?:&v=\\d+)?$`),
  )
  const panel = page.getByRole("region", { name: TITULO_LISTO })
  // Opening from a row moves the focus to the panel's heading.
  await expect(panel.getByRole("heading", { name: TITULO_LISTO, level: 2 })).toBeFocused()
  await expect(tabla.getByRole("link", { name: TITULO_LISTO })).toHaveAttribute("aria-current", "true")
  await expect(panel.getByRole("heading", { name: "Ideas sacadas" })).toBeVisible()
  await expect(panel).toContainText("«El aislamiento pesa más que las horas extra.»")
  await expect(panel).toContainText(`${AUTORA} · ${CREDENCIAL}`)
  await expect(panel.getByText("Detalle para WAV")).toBeVisible()

  await page.goBack()
  await expect(page).toHaveURL(/\/biblioteca(?:[?&]v=\d+)?$/)
  await expect(page.getByText(PISTA)).toBeVisible()
  await expect(page.getByRole("region", { name: TITULO_LISTO })).toHaveCount(0)

  await tocarHastaLlegar(
    page,
    tabla.getByRole("link", { name: TITULO_LISTO }),
    new RegExp(`/biblioteca\\?m=${escena.listo}(?:&v=\\d+)?$`),
  )
  await expect(panel.getByRole("heading", { name: TITULO_LISTO, level: 2 })).toBeFocused()
  await panel.getByRole("link", { name: "Ver las 3" }).click()
  await expect(page).toHaveURL(new RegExp(`/biblioteca/materiales/${escena.listo}$`))
})

test("the panel closes with its own control, keeps the filter and gives the focus back to the row", async ({
  page,
}) => {
  await page.goto("/biblioteca?estado=listo")
  const fila = page.getByRole("table", { name: "Materiales" }).getByRole("link", { name: TITULO_LISTO })
  await tocarHastaLlegar(page, fila, new RegExp(`/biblioteca\\?estado=listo&m=${escena.listo}(?:&v=\\d+)?$`))
  await page.getByRole("link", { name: "Cerrar el panel" }).click()
  await expect(page).toHaveURL(/\/biblioteca\?estado=listo(?:[?&]v=\d+)?$/)
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

test("with the panel open, a material that finishes turns Listo in the table and the panel on its own", async ({
  page,
}) => {
  await page.goto(`/biblioteca?m=${escena.procesando}`)
  const titulo = "Liderar con IA sin perder a las personas"
  const fila = page.getByRole("table", { name: "Materiales" }).getByRole("row").filter({ hasText: titulo })
  const panel = page.getByRole("region", { name: titulo })
  await expect(fila).toContainText("Procesando")

  await pool.query("update public.materiales set estado = 'listo' where id = $1", [escena.procesando])

  await expect(fila).toContainText("Listo", { timeout: 25_000 })
  await expect(panel.getByText("Listo", { exact: true })).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`/biblioteca\\?m=${escena.procesando}(?:&v=\\d+)?$`))
})

test("on a computer the detail reads in one column and keeps its actions in a side column, not across the page", async ({
  page,
}) => {
  await page.goto(`/biblioteca/materiales/${escena.listo}`)
  const titulo = page.getByRole("heading", { name: TITULO_LISTO, level: 1 })
  const acciones = page.getByRole("complementary", { name: "Acciones del material" })
  const descargar = acciones.getByRole("link", { name: "Descargar texto original" })
  await expect(descargar).toBeVisible()
  await expect(acciones.getByRole("button", { name: "Reprocesar" })).toBeVisible()
  await expect(acciones.getByRole("button", { name: "Cambiar autor o quién es para ti" })).toBeVisible()
  await expect(acciones.getByText("Detalle para WAV")).toBeVisible()
  // One of each on screen: the phone's copies are not shown.
  await expect(page.getByRole("link", { name: "Descargar texto original" })).toHaveCount(1)
  await expect(page.getByRole("button", { name: "Cambiar autor o quién es para ti" })).toHaveCount(1)

  const caja = async (localizador: typeof titulo) => {
    const medida = await localizador.boundingBox()
    if (!medida) throw new Error("sin caja")
    return medida
  }
  const principal = await caja(page.locator("[data-detalle=principal]"))
  const lateral = await caja(acciones)
  expect(principal.width).toBeLessThanOrEqual(42 * 17 + 1)
  expect(lateral.width).toBeLessThanOrEqual(20 * 17 + 1)
  expect(lateral.x).toBeGreaterThan(principal.x + principal.width)
  expect((await caja(descargar)).width).toBeLessThan(lateral.width + 1)
  await expect(acciones).toHaveCSS("position", "sticky")

  // Screen readers meet the material first, then its actions.
  const orden = await page.evaluate(() => {
    const h1 = document.querySelector("h1")
    const aside = document.querySelector("aside[aria-label='Acciones del material']")
    return h1 && aside ? h1.compareDocumentPosition(aside) & Node.DOCUMENT_POSITION_FOLLOWING : 0
  })
  expect(orden).toBeTruthy()
  await expect(page.getByRole("link", { name: "Materiales" })).toBeVisible()
  expect(await revisarConAxe(page, "detalle en el computador")).toEqual([])
})

test("on a computer a material with an error offers Reintentar in the side column", async ({ page }) => {
  await page.goto(`/biblioteca/materiales/${escena.conError}`)
  const acciones = page.getByRole("complementary", { name: "Acciones del material" })
  await expect(acciones.getByRole("button", { name: "Reintentar" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Reintentar" })).toHaveCount(1)
})

test("at 1280 with the panel open the Material column takes the room: titles wrap to two lines at most", async ({
  page,
}) => {
  await page.goto(`/biblioteca?m=${escena.listo}`)
  await expect(page.getByRole("region", { name: TITULO_LISTO })).toBeVisible()
  const lineas = await page.locator("table a[data-abre-panel]").evaluateAll((enlaces) =>
    enlaces.map((enlace) => ({
      titulo: enlace.textContent,
      lineas: new Set(Array.from(enlace.getClientRects(), (caja) => Math.round(caja.top))).size,
    })),
  )
  expect(lineas.length).toBe(5)
  expect(Math.max(...lineas.map((fila) => fila.lineas))).toBeLessThanOrEqual(2)
  const tabla = await page.getByRole("table", { name: "Materiales" }).boundingBox()
  const contenedor = await page.locator("[data-ancho=biblioteca] table").evaluate((t) => t.parentElement?.clientWidth)
  expect(tabla?.width ?? 0).toBeLessThanOrEqual((contenedor ?? 0) + 1)
})

test("the table and the side panel pass WCAG 2.x AA", async ({ page }) => {
  await page.goto(`/biblioteca?m=${escena.listo}`)
  await expect(page.getByRole("region", { name: TITULO_LISTO })).toBeVisible()
  expect(await revisarConAxe(page, "tabla y panel")).toEqual([])
  await page.getByText("Detalle para WAV").click()
  expect(await revisarConAxe(page, "panel con el detalle para WAV abierto")).toEqual([])
})
