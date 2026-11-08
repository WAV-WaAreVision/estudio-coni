import { expect, type Locator, type Page, test } from "@playwright/test"
import { pool } from "../integration/db"
import { limpiarBorradores } from "../integration/limpiar-borradores"
import { bloquearRedExterna } from "./ayudas"
import {
  AUTORA,
  BORRADOR_DE_INSTAGRAM,
  type EscenaDeAutoresYTemas,
  PILAR,
  RED_EN_BORRADOR,
  sembrarAutoresYTemas,
  sembrarBorradores,
  TEMA_PRINCIPAL,
} from "./biblioteca-escena"

// The Biblioteca pages of group C keep the phone's single column, in the same order (issue 103).
let escena: EscenaDeAutoresYTemas
let borradores: { pilar: string; red: string }

test.beforeEach(async ({ page }) => {
  await bloquearRedExterna(page)
  escena = await sembrarAutoresYTemas()
  borradores = await sembrarBorradores()
})

test.afterAll(async () => {
  await limpiarBorradores()
})

async function caja(elemento: Locator, nombre: string) {
  // The page streams in: measure once the element is on screen.
  await expect(elemento).toBeVisible()
  const r = await elemento.boundingBox()
  if (!r) throw new Error(`${nombre}: sin caja`)
  return r
}

/** `despues` under `antes`, at the same left edge: one column in the phone's order. */
async function unaDebajoDeOtra(antes: Locator, despues: Locator, nombre: string) {
  const a = await caja(antes, nombre)
  const b = await caja(despues, nombre)
  expect(b.y, nombre).toBeGreaterThanOrEqual(a.y + a.height)
  expect(Math.abs(b.x - a.x), nombre).toBeLessThanOrEqual(1)
}

async function sinScrollDeLado(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)
}

test("an author's page keeps its ideas one under another and Unir at the end", async ({ page }) => {
  await page.goto(`/biblioteca/autores/${escena.autora}`)
  const ideas = page.getByRole("list", { name: `Ideas sobre ${TEMA_PRINCIPAL}` }).getByRole("listitem")
  await unaDebajoDeOtra(page.getByRole("heading", { name: AUTORA, level: 1 }), ideas.nth(0), "autor título")
  await unaDebajoDeOtra(ideas.nth(0), ideas.nth(1), "autor ideas")
  await unaDebajoDeOtra(ideas.nth(1), page.getByRole("button", { name: "Unir con otro autor" }), "autor unir")
  await sinScrollDeLado(page)
})

test("a topic's page keeps its pillars between the title and the ideas", async ({ page }) => {
  await page.goto(`/biblioteca/temas/${escena.carga}`)
  const pilares = page.getByRole("region", { name: "Pilares" })
  const ideas = page.getByRole("list", { name: `Ideas de ${AUTORA}` }).getByRole("listitem")
  await unaDebajoDeOtra(page.getByRole("heading", { name: TEMA_PRINCIPAL, level: 1 }), pilares, "tema título")
  await unaDebajoDeOtra(pilares, ideas.nth(0), "tema pilares")
  await unaDebajoDeOtra(ideas.nth(0), ideas.nth(1), "tema ideas")
  await sinScrollDeLado(page)
})

test("Borradores keeps the pillar drafts above the network drafts", async ({ page }) => {
  await page.goto("/biblioteca/temas/borradores")
  await unaDebajoDeOtra(
    page.getByRole("article", { name: BORRADOR_DE_INSTAGRAM.nombre }),
    page.getByRole("article", { name: RED_EN_BORRADOR }),
    "borradores",
  )
  await sinScrollDeLado(page)
})

/** The form alone: the computer's panel about saving is not on the phone. */
async function soloElFormulario(page: Page) {
  await expect(page.getByRole("button", { name: /^Guardar/ })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Al guardar" })).toBeHidden()
  await sinScrollDeLado(page)
}

test("the drafts' forms keep only the form", async ({ page }) => {
  await page.goto("/biblioteca/temas/pilar-nuevo?red=instagram")
  await soloElFormulario(page)
  await page.goto("/biblioteca/temas/red-nueva")
  await soloElFormulario(page)
  await page.goto(`/biblioteca/temas/borradores/${borradores.pilar}/editar`)
  await soloElFormulario(page)
  await page.goto(`/biblioteca/temas/borradores/${borradores.red}/editar`)
  await soloElFormulario(page)
})

test("approving a pillar keeps each stage as a block with its weights, its total and its warning", async ({ page }) => {
  const id = (
    await pool.query<{ id: string }>(
      `insert into public.borradores_de_pilar (red, nombre, nombre_corto, descripcion, peso)
       values ('linkedin', 'Liderazgo sereno: decidir con IA', 'Liderazgo sereno', 'Cómo decide una líder.', 10)
       returning id`,
    )
  ).rows[0]?.id
  if (!id) throw new Error("No se creó el borrador de LinkedIn")
  await page.goto(`/biblioteca/temas/borradores/${id}/aprobar`)
  const hoy = page.getByRole("group", { name: "Hoy", exact: true })
  const total = hoy.getByRole("status").filter({ hasText: "Total:" })
  await unaDebajoDeOtra(hoy.getByLabel(`${PILAR}, Hoy`), total, "aprobar total")
  // The warning's text sits inside its block, under the total.
  const aviso = await caja(hoy.getByText(/^Los pesos de LinkedIn suman 110 %/), "aprobar aviso")
  const delTotal = await caja(total, "aprobar aviso")
  expect(aviso.y).toBeGreaterThanOrEqual(delTotal.y + delTotal.height)
  // Only the stage's own total: the computer's panel is not on the phone.
  await expect(page.getByRole("status").filter({ hasText: "Total:" }).first()).toHaveText("Total: 110 %")
  await expect(page.getByTestId("pagina-panel")).toBeHidden()
  await sinScrollDeLado(page)
})
