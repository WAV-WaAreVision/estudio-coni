import { expect, type Page, test } from "@playwright/test"
import { bloquearRedExterna, revisarConAxe, tocarHastaLlegar } from "./ayudas"
import { type EscenaDeBiblioteca, sembrarBiblioteca, TITULO_LISTO } from "./biblioteca-escena"

// Runs only in the `escritorio` project (1280 x 900).
let escena: EscenaDeBiblioteca

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await bloquearRedExterna(page)
  escena = await sembrarBiblioteca()
})

const aviso = (page: Page) => page.getByRole("status").filter({ hasText: /^Borré|^Lo borré/ })
const recuperado = (page: Page) => page.getByRole("status").filter({ hasText: "Lo recuperé." })
const tabla = (page: Page) => page.getByRole("table", { name: "Materiales" })
const panel = (page: Page) => page.getByRole("region", { name: TITULO_LISTO })

async function borrarDesdeElPanel(page: Page) {
  await tocarHastaLlegar(
    page,
    tabla(page).getByRole("link", { name: TITULO_LISTO }),
    new RegExp(`/biblioteca\\?m=${escena.listo}(?:&v=\\d+)?$`),
  )
  await page
    .getByRole("complementary", { name: "Material elegido" })
    .getByRole("button", { name: "Borrar material" })
    .click()
  await expect(page).toHaveURL(/\/biblioteca$/)
}

test("deletes a material from the side panel: the panel closes, the row leaves the table, and Deshacer puts it back", async ({
  page,
}) => {
  await page.goto("/biblioteca")
  await borrarDesdeElPanel(page)

  await expect(aviso(page)).toHaveText(`Borré «${TITULO_LISTO}».Deshacer`)
  await expect(aviso(page).getByRole("button", { name: "Deshacer" })).toBeFocused()
  await expect(panel(page)).toHaveCount(0)
  await expect(tabla(page).getByRole("link", { name: TITULO_LISTO })).toHaveCount(0)
  expect(await revisarConAxe(page, "tabla con el aviso de borrado")).toEqual([])

  await aviso(page).getByRole("button", { name: "Deshacer" }).click()
  await expect(recuperado(page)).toBeVisible()
  await expect(page.getByRole("heading", { name: "Biblioteca", level: 1 })).toBeFocused()
  await expect(tabla(page).getByRole("link", { name: TITULO_LISTO })).toHaveCount(1)
})

test("deleting the same material a second time from the panel shows the toast again", async ({ page }) => {
  await page.goto("/biblioteca")
  await borrarDesdeElPanel(page)
  await expect(aviso(page)).toBeVisible()
  await aviso(page).getByRole("button", { name: "Deshacer" }).click()
  await expect(recuperado(page)).toBeVisible()
  await expect(tabla(page).getByRole("link", { name: TITULO_LISTO })).toHaveCount(1)

  // The list stayed mounted the whole time: the toast must still see this as a new deletion.
  await borrarDesdeElPanel(page)
  await expect(aviso(page)).toHaveText(`Borré «${TITULO_LISTO}».Deshacer`)
  await expect(tabla(page).getByRole("link", { name: TITULO_LISTO })).toHaveCount(0)
  await aviso(page).getByRole("button", { name: "Deshacer" }).click()
  await expect(recuperado(page)).toBeVisible()
  await expect(tabla(page).getByRole("link", { name: TITULO_LISTO })).toHaveCount(1)
})

test("the material page's side column offers Borrar material too", async ({ page }) => {
  await page.goto(`/biblioteca/materiales/${escena.listo}`)
  const columna = page.getByRole("complementary", { name: "Acciones del material" })
  await columna.getByRole("button", { name: "Borrar material" }).click()
  await expect(page).toHaveURL(/\/biblioteca$/)
  await expect(aviso(page)).toContainText(`Borré «${TITULO_LISTO}».`)
})
