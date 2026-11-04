import { expect, test } from "@playwright/test"
import { pool } from "../integration/db"
import { bloquearRedExterna, tocarHastaLlegar } from "./ayudas"
import {
  AUTORA,
  CREDENCIAL,
  type EscenaDeAutoresYTemas,
  OTRA_AUTORA,
  OTRO_TEMA,
  SIN_MATERIAL,
  sembrarAutoresYTemas,
  TEMA_DE_UN_AUTOR,
  TEMA_PRINCIPAL,
} from "./biblioteca-escena"

let escena: EscenaDeAutoresYTemas

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await bloquearRedExterna(page)
  escena = await sembrarAutoresYTemas()
})

test("Autores shows each author with kind, counts without zeros and top topics, most ideas first (4i)", async ({
  page,
}) => {
  await page.goto("/biblioteca/autores")
  await expect(page.getByRole("heading", { name: "Biblioteca", level: 1 })).toBeVisible()
  await expect(
    page.getByRole("navigation", { name: "Secciones de la Biblioteca" }).getByRole("link", { name: "Autores" }),
  ).toHaveAttribute("aria-current", "page")

  const tarjetas = page.getByRole("list", { name: "Autores" }).getByRole("listitem")
  await expect(tarjetas).toHaveCount(4)
  await expect(tarjetas.nth(0)).toContainText(AUTORA)
  await expect(tarjetas.nth(0)).toContainText(`Persona · ${CREDENCIAL}`)
  await expect(tarjetas.nth(0)).toContainText("2 materiales · 3 ideas sacadas")
  await expect(tarjetas.nth(0)).toContainText(`${TEMA_PRINCIPAL} · ${OTRO_TEMA}`)
  await expect(tarjetas.nth(1)).toContainText(OTRA_AUTORA)
  await expect(tarjetas.nth(1)).toContainText("1 material · 2 ideas sacadas")
  await expect(tarjetas.nth(2)).toContainText(escena.nombreDeConi)
  await expect(tarjetas.nth(2)).toContainText("Coni")
  await expect(tarjetas.nth(2)).toContainText("4 materiales · 1 idea sacada")
  const vacia = tarjetas.nth(3)
  await expect(vacia).toContainText(SIN_MATERIAL)
  await expect(vacia).toContainText("Todavía no hay material de esta persona. Súbelo desde Subir.")
  await expect(vacia.getByRole("link", { name: "Subir", exact: true })).toHaveAttribute("href", "/biblioteca/subir")

  await tocarHastaLlegar(
    page,
    tarjetas.nth(0).getByRole("link", { name: new RegExp(AUTORA) }),
    new RegExp(`/biblioteca/autores/${escena.autora}$`),
  )
  await expect(page.getByRole("heading", { name: AUTORA, level: 1 })).toBeVisible()
})

test("the search finds by name or alias, ignoring accents and case, and says when nobody matches", async ({ page }) => {
  await page.goto("/biblioteca/autores")
  const tarjetas = page.getByRole("list", { name: "Autores" }).getByRole("listitem")
  const buscar = page.getByLabel("Buscar por nombre")
  await buscar.fill("RUÍZ")
  await expect(tarjetas).toHaveCount(2)
  await buscar.fill("rosario")
  await expect(tarjetas).toHaveCount(1)
  await expect(tarjetas.nth(0)).toContainText(escena.nombreDeConi)
  await buscar.fill("zzz")
  await expect(page.getByText("Nadie se llama así todavía.")).toBeVisible()
  await expect(tarjetas).toHaveCount(0)
  await buscar.fill("")
  await expect(tarjetas).toHaveCount(4)
})

test("an author's page groups its ideas by topic, links each topic, and folds the detail for WAV (4h)", async ({
  page,
}) => {
  await page.goto(`/biblioteca/autores/${escena.autora}`)
  await expect(page.getByRole("link", { name: "Autores", exact: true })).toHaveAttribute("href", "/biblioteca/autores")
  await expect(page.getByText("2 materiales · 3 ideas sacadas")).toBeVisible()
  const titulos = await page.getByRole("heading", { level: 2 }).allTextContents()
  expect(titulos.indexOf(TEMA_PRINCIPAL)).toBeGreaterThanOrEqual(0)
  expect(titulos.indexOf(TEMA_PRINCIPAL)).toBeLessThan(titulos.indexOf(OTRO_TEMA))
  await expect(page.getByRole("heading", { name: TEMA_PRINCIPAL, level: 2 }).getByRole("link")).toHaveAttribute(
    "href",
    `/biblioteca/temas/${escena.carga}`,
  )

  const ideas = page.getByRole("list", { name: `Ideas sobre ${TEMA_PRINCIPAL}` }).getByRole("listitem")
  await expect(ideas).toHaveCount(2)
  await expect(ideas.nth(0)).toContainText("«El aislamiento pesa más que las horas extra.»")
  const detalle = ideas.nth(0).locator("details")
  expect(await detalle.evaluate((nodo) => (nodo as HTMLDetailsElement).open)).toBe(false)
  await ideas.nth(0).getByText("Detalle para WAV").click()
  await expect(detalle).toContainText("Tipo de idea: Dato")
  await expect(detalle).toContainText("Evidencia: Estudio")
  await expect(page.getByText(/Afirmaci/)).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Unir con otro autor" })).toBeVisible()
})

test("Coni's own page never offers joining", async ({ page }) => {
  await page.goto(`/biblioteca/autores/${escena.coni}`)
  await expect(page.getByRole("heading", { name: escena.nombreDeConi, level: 1 })).toBeVisible()
  await expect(page.getByRole("button", { name: "Unir con otro autor" })).toHaveCount(0)
})

test("joining two authors names both, says it cannot be undone, and lands on the one that stayed", async ({ page }) => {
  await page.goto(`/biblioteca/autores/${escena.otraAutora}`)
  await page.getByRole("button", { name: "Unir con otro autor" }).click()
  await expect(page.getByLabel("Buscar por nombre")).toBeFocused()
  await page.getByLabel("Buscar por nombre").fill("daniela")
  await page
    .getByRole("list", { name: "Con quién unir" })
    .getByRole("button", { name: `${AUTORA}, ${CREDENCIAL}` })
    .click()
  const pregunta = page.getByText(/No se puede deshacer\./)
  await expect(pregunta).toContainText(`Uno a ${OTRA_AUTORA} con ${AUTORA}`)
  await page.getByRole("button", { name: "Sí, unir" }).click()

  await expect(page).toHaveURL(new RegExp(`/biblioteca/autores/${escena.autora}$`))
  await expect(page.getByText("3 materiales · 5 ideas sacadas")).toBeVisible()
  await expect(page.getByRole("heading", { name: TEMA_DE_UN_AUTOR, level: 2 })).toBeVisible()
  const { rows } = await pool.query<{ alias: string[] }>("select alias from public.autores where id = $1", [
    escena.autora,
  ])
  expect(rows[0]?.alias).toContain(OTRA_AUTORA)

  // The joined name is now an alias: the search still finds her by it.
  await page.goto("/biblioteca/autores")
  const tarjetas = page.getByRole("list", { name: "Autores" }).getByRole("listitem")
  await expect(tarjetas).toHaveCount(3)
  await page.getByLabel("Buscar por nombre").fill("d. ruiz")
  await expect(tarjetas).toHaveCount(1)
  await expect(tarjetas.nth(0)).toContainText(AUTORA)
})
