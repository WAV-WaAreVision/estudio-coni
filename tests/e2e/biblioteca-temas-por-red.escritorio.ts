import { expect, test } from "@playwright/test"
import { bloquearRedExterna, revisarConAxe, tocarHastaLlegar } from "./ayudas"
import { type EscenaDeAutoresYTemas, sembrarAutoresYTemas, TEMA_PRINCIPAL } from "./biblioteca-escena"

// Runs only in the `escritorio` project (1280 x 900).
let escena: EscenaDeAutoresYTemas

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await bloquearRedExterna(page)
  escena = await sembrarAutoresYTemas()
})

test("on the computer the row filters the table, the badge follows the network and the side panel keeps it", async ({
  page,
}) => {
  await page.goto("/biblioteca/temas?red=instagram&sin-tratar=1")
  const tabla = page.getByRole("table", { name: "Temas" })
  await expect(tabla.getByRole("row")).toHaveCount(4)
  await expect(tabla.getByRole("row", { name: new RegExp(TEMA_PRINCIPAL) })).not.toContainText("Ya lo traté")
  expect(await revisarConAxe(page, "temas en instagram en el computador")).toEqual([])

  await tocarHastaLlegar(
    page,
    tabla.getByRole("link", { name: TEMA_PRINCIPAL, exact: true }),
    new RegExp(`/biblioteca/temas\\?red=instagram&sin-tratar=1&t=${escena.carga}(?:&v=\\d+)?$`),
  )
  const panel = page.getByRole("region", { name: TEMA_PRINCIPAL })
  await expect(panel).not.toContainText("Ya lo traté")
  expect(await revisarConAxe(page, "temas en instagram con el panel")).toEqual([])
  await panel.getByRole("link", { name: "Cerrar el panel" }).click()
  await expect(page).toHaveURL(/\/biblioteca\/temas\?red=instagram&sin-tratar=1(?:[?&]v=\d+)?$/)

  await page.goto("/biblioteca/temas?red=linkedin")
  await expect(tabla.getByRole("row", { name: new RegExp(TEMA_PRINCIPAL) })).toContainText("Ya lo traté")
})
