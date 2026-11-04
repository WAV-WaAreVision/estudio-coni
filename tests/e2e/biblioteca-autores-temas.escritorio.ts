import { expect, test } from "@playwright/test"
import { bloquearRedExterna, revisarConAxe, tocarHastaLlegar } from "./ayudas"
import {
  AUTORA,
  type EscenaDeAutoresYTemas,
  SIN_MATERIAL,
  sembrarAutoresYTemas,
  TEMA_DE_UN_AUTOR,
  TEMA_PRINCIPAL,
  TITULO_LISTO,
} from "./biblioteca-escena"

// Runs only in the `escritorio` project (1280 x 900).
let escena: EscenaDeAutoresYTemas

const PISTA_DE_AUTORES = "Elige un autor de la tabla para ver aquí sus temas y sus ideas sacadas."
const PISTA_DE_TEMAS = "Elige un tema de la tabla para ver aquí cuántas ideas sacadas tiene y de quiénes."

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await bloquearRedExterna(page)
  escena = await sembrarAutoresYTemas()
})

test("Autores is a table; a row opens its summary in the sticky side panel with ?a, and Back closes it", async ({
  page,
}) => {
  await page.goto("/biblioteca/autores")
  await expect(page.getByRole("list", { name: "Autores" })).toBeHidden()
  const tabla = page.getByRole("table", { name: "Autores" })
  await expect(tabla.getByRole("columnheader")).toHaveText(["Autor", "Tipo", "Temas", "Materiales", "Ideas sacadas"])
  await expect(page.getByText(PISTA_DE_AUTORES)).toBeVisible()

  await tocarHastaLlegar(
    page,
    tabla.getByRole("link", { name: AUTORA, exact: true }),
    new RegExp(`/biblioteca/autores\\?a=${escena.autora}(?:&v=\\d+)?$`),
  )
  const panel = page.getByRole("region", { name: AUTORA })
  await expect(panel.getByRole("heading", { name: AUTORA, level: 2 })).toBeFocused()
  await expect(panel).toContainText("2 materiales · 3 ideas sacadas")
  await expect(panel.getByRole("link", { name: TEMA_PRINCIPAL })).toHaveAttribute(
    "href",
    `/biblioteca/temas/${escena.carga}`,
  )
  await expect(panel.getByRole("link", { name: `Ver todo de ${AUTORA}` })).toHaveAttribute(
    "href",
    `/biblioteca/autores/${escena.autora}`,
  )
  await expect(page.getByRole("complementary", { name: "Autor elegido" })).toHaveCSS("position", "sticky")

  await page.goBack()
  await expect(page).toHaveURL(/\/biblioteca\/autores(?:[?&]v=\d+)?$/)
  await expect(page.getByText(PISTA_DE_AUTORES)).toBeVisible()

  await page.getByLabel("Buscar por nombre").fill("instituto")
  await expect(tabla.getByRole("row")).toHaveCount(2)
  await expect(tabla).toContainText(SIN_MATERIAL)
})

test("Temas is a table that keeps its filters; a row opens the side panel, and closing gives the focus back", async ({
  page,
}) => {
  await page.goto("/biblioteca/temas?cobertura=un-autor")
  const tabla = page.getByRole("table", { name: "Temas" })
  await expect(tabla.getByRole("columnheader")).toHaveText(["Tema", "Ideas sacadas", "Autores"])
  await expect(tabla.getByRole("row")).toHaveCount(3)
  await expect(page.getByText(PISTA_DE_TEMAS)).toBeVisible()

  const fila = tabla.getByRole("link", { name: TEMA_DE_UN_AUTOR, exact: true })
  await tocarHastaLlegar(
    page,
    fila,
    new RegExp(`/biblioteca/temas\\?cobertura=un-autor&t=${escena.deUnAutor}(?:&v=\\d+)?$`),
  )
  const panel = page.getByRole("region", { name: TEMA_DE_UN_AUTOR })
  await expect(panel.getByRole("heading", { name: TEMA_DE_UN_AUTOR, level: 2 })).toBeFocused()
  await expect(panel).toContainText("2 ideas sacadas · 1 autor")
  await expect(panel).toContainText("Un solo autor")
  await expect(panel.getByRole("link", { name: "Ver sus ideas" })).toHaveAttribute(
    "href",
    `/biblioteca/temas/${escena.deUnAutor}`,
  )

  await panel.getByRole("link", { name: "Cerrar el panel" }).click()
  await expect(page).toHaveURL(/\/biblioteca\/temas\?cobertura=un-autor(?:[?&]v=\d+)?$/)
  await expect(page.getByText(PISTA_DE_TEMAS)).toBeVisible()
  await expect(fila).toBeFocused()
})

test("from Materiales, the table's topic and the panel's author lead to their pages (D9)", async ({ page }) => {
  await page.goto("/biblioteca")
  const tema = page
    .getByRole("table", { name: "Materiales" })
    .getByRole("link", { name: `${TEMA_PRINCIPAL} y 1 tema más` })
  await expect(tema).toHaveAttribute("href", `/biblioteca/temas/${escena.carga}`)

  await page.goto(`/biblioteca?m=${escena.listo}`)
  const panel = page.getByRole("region", { name: TITULO_LISTO })
  await tocarHastaLlegar(
    page,
    panel.getByRole("link", { name: AUTORA, exact: true }),
    new RegExp(`/biblioteca/autores/${escena.autora}$`),
  )
  await expect(page.getByRole("heading", { name: AUTORA, level: 1 })).toBeVisible()
})

test("the tables and their side panels pass WCAG 2.x AA", async ({ page }) => {
  await page.goto(`/biblioteca/autores?a=${escena.autora}`)
  await expect(page.getByRole("region", { name: AUTORA })).toBeVisible()
  expect(await revisarConAxe(page, "autores con el panel")).toEqual([])
  await page.goto(`/biblioteca/temas?t=${escena.carga}`)
  await expect(page.getByRole("region", { name: TEMA_PRINCIPAL })).toBeVisible()
  expect(await revisarConAxe(page, "temas con el panel")).toEqual([])
  await page.goto(`/biblioteca/temas/${escena.carga}`)
  expect(await revisarConAxe(page, "tema en el computador")).toEqual([])
})
