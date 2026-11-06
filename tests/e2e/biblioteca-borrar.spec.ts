import { type Browser, expect, type Page, test } from "@playwright/test"
import { pool } from "../integration/db"
import { bloquearRedExterna, revisarConAxe } from "./ayudas"
import {
  AUTORA,
  type EscenaDeAutoresYTemas,
  SIN_MATERIAL,
  sembrarAutoresYTemas,
  TEMA_PRINCIPAL,
  TITULO_LISTO,
} from "./biblioteca-escena"
import { ESTADO_DE_SESION, URL_DE_LA_APP } from "./entorno"

const CHARLA = "Charla larga sobre el síndrome del impostor"
const LIDERAR = "Liderar con IA sin perder a las personas"
// What procesar-material writes when it stops on a material she deleted (plan D8, lib/ingesta/procesar.ts).
const MOTIVO_BORRADO_AL_PROCESAR = "Paré de procesarlo porque lo borraste. Toca Reintentar para seguir."
const NINGUNO = "99999999-2222-4333-8444-555555555555"

let escena: EscenaDeAutoresYTemas

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await bloquearRedExterna(page)
  escena = await sembrarAutoresYTemas()
})

const aviso = (page: Page) => page.getByRole("status").filter({ hasText: /^Borré|^Lo borré/ })
const recuperado = (page: Page) => page.getByRole("status").filter({ hasText: "Lo recuperé." })
const tarjetas = (page: Page) => page.getByRole("list", { name: "Materiales" }).getByRole("listitem")
const titulo = (page: Page) => page.getByRole("heading", { name: "Biblioteca", level: 1 })

async function borrarDesdeSuPagina(page: Page, id: string) {
  await page.goto(`/biblioteca/materiales/${id}`)
  await page.getByRole("button", { name: "Borrar material" }).click()
  await expect(page).toHaveURL(/\/biblioteca$/)
}

/** A second phone of the same session, to look at other screens while the first keeps its toast open. */
async function otroTelefono(browser: Browser): Promise<Page> {
  const contexto = await browser.newContext({
    baseURL: URL_DE_LA_APP,
    storageState: ESTADO_DE_SESION,
    viewport: { width: 390, height: 844 },
    locale: "es-CL",
    timezoneId: "America/Santiago",
  })
  const otra = await contexto.newPage()
  await bloquearRedExterna(otra)
  return otra
}

test("deletes a material from its page with no question; it leaves the list and the counts, and Deshacer brings it back", async ({
  page,
}) => {
  await page.goto("/biblioteca")
  await expect(page.getByRole("link", { name: "Procesando · 2" })).toBeVisible()

  await borrarDesdeSuPagina(page, escena.esperaOk)
  await expect(aviso(page)).toHaveText(`Borré «${CHARLA}».Deshacer`)
  // She lands with the focus on what she most likely wants next.
  await expect(aviso(page).getByRole("button", { name: "Deshacer" })).toBeFocused()
  await expect(tarjetas(page).filter({ hasText: CHARLA })).toHaveCount(0)
  await expect(page.getByRole("link", { name: "Procesando · 1" })).toBeVisible()
  // TrasElAviso took the note out of the address and the toast stayed.
  await expect(page).toHaveURL(/\/biblioteca$/)
  await expect(aviso(page)).toBeVisible()
  expect(await revisarConAxe(page, "lista con el aviso de borrado")).toEqual([])

  await aviso(page).getByRole("button", { name: "Deshacer" }).click()
  await expect(recuperado(page)).toBeVisible()
  // The second toast says it, with nothing left to undo, and the focus goes back to the list's heading.
  await expect(recuperado(page).getByRole("button")).toHaveCount(0)
  await expect(titulo(page)).toBeFocused()
  // The list was redrawn after Deshacer and the toast survived it.
  await expect(tarjetas(page).filter({ hasText: CHARLA })).toHaveCount(1)
  await expect(page.getByRole("link", { name: "Procesando · 2" })).toBeVisible()
  expect(await revisarConAxe(page, "lista con «Lo recuperé.»")).toEqual([])

  await page.goto(`/biblioteca/autores/${escena.autora}`)
  await expect(page.getByText("2 materiales · 3 ideas sacadas")).toBeVisible()
})

test("a deleted material leaves its author's page, its topic and Temas, and Deshacer brings it back everywhere", async ({
  page,
  browser,
}) => {
  // The toast lasts 8 s: her phone's clock stops once it is up, while a second phone visits the other screens.
  await page.clock.install()
  await borrarDesdeSuPagina(page, escena.listo)
  await expect(aviso(page)).toContainText(`Borré «${TITULO_LISTO}».`)
  await page.clock.pauseAt(Date.now() + 1000)
  await expect(tarjetas(page).filter({ hasText: TITULO_LISTO })).toHaveCount(0)

  const otra = await otroTelefono(browser)
  const carga = otra.getByRole("list", { name: "Temas" }).getByRole("listitem").filter({ hasText: TEMA_PRINCIPAL })
  await otra.goto(`/biblioteca/autores/${escena.autora}`)
  await expect(otra.getByRole("heading", { name: AUTORA, level: 1 })).toBeVisible()
  await expect(otra.getByText("1 material", { exact: true })).toBeVisible()
  await otra.goto(`/biblioteca/temas/${escena.carga}`)
  await expect(otra.getByRole("heading", { name: TEMA_PRINCIPAL, level: 1 })).toBeVisible()
  await expect(otra.getByRole("heading", { name: AUTORA })).toHaveCount(0)
  await otra.goto("/biblioteca/temas")
  await expect(carga).toContainText("1 idea sacada · 1 autor")
  await otra.goto(`/biblioteca/materiales/${escena.listo}`)
  await expect(otra.getByRole("heading", { name: "No encontré lo que buscabas", level: 1 })).toBeVisible()

  await aviso(page).getByRole("button", { name: "Deshacer" }).click()
  await expect(recuperado(page)).toBeVisible()
  await expect(tarjetas(page).filter({ hasText: TITULO_LISTO })).toHaveCount(1)

  await otra.goto("/biblioteca/temas")
  await expect(carga).toContainText("3 ideas sacadas · 2 autores")
  await otra.goto(`/biblioteca/temas/${escena.carga}`)
  await expect(otra.getByRole("heading", { name: AUTORA })).toBeVisible()
  await otra.goto(`/biblioteca/autores/${escena.autora}`)
  await expect(otra.getByText("2 materiales · 3 ideas sacadas")).toBeVisible()
  await otra.goto(`/biblioteca/materiales/${escena.listo}`)
  await expect(otra.getByRole("heading", { name: TITULO_LISTO, level: 1 })).toBeVisible()
  await otra.context().close()
})

test("the notice does not come back on reload, and the address loses the note", async ({ page }) => {
  await borrarDesdeSuPagina(page, escena.esperaOk)
  await expect(aviso(page)).toBeVisible()
  await expect(page).toHaveURL(/\/biblioteca$/)
  await page.reload()
  await expect(titulo(page)).toBeVisible()
  await expect(aviso(page)).toHaveCount(0)
})

test("an old address with the note shows no toast, for a material that came back or one that never was", async ({
  page,
}) => {
  for (const id of [escena.listo, NINGUNO]) {
    await page.goto(`/biblioteca?aviso=borrado&id=${id}`)
    await expect(titulo(page)).toBeVisible()
    await expect(page).toHaveURL(/\/biblioteca$/)
    await expect(aviso(page)).toHaveCount(0)
  }
  await page.goto(`/biblioteca/autores?aviso=borrado&id=${escena.sinMaterial}`)
  await expect(page).toHaveURL(/\/biblioteca\/autores$/)
  await expect(aviso(page)).toHaveCount(0)
})

test("the toast closes on its own after 8 seconds and gives the focus back to the list's heading", async ({ page }) => {
  await borrarDesdeSuPagina(page, escena.esperaOk)
  await expect(aviso(page).getByRole("button", { name: "Deshacer" })).toBeFocused()
  await expect(aviso(page)).toHaveCount(0, { timeout: 12_000 })
  await expect(titulo(page)).toBeFocused()
  await expect(tarjetas(page).filter({ hasText: CHARLA })).toHaveCount(0)
})

test("Deshacer after maintenance deleted it says it can no longer be recovered", async ({ page }) => {
  await borrarDesdeSuPagina(page, escena.esperaOk)
  await expect(aviso(page)).toBeVisible()
  await pool.query("delete from public.materiales where id = $1", [escena.esperaOk])
  await aviso(page).getByRole("button", { name: "Deshacer" }).click()
  const final = page.getByRole("status").filter({ hasText: "Ya no se puede recuperar: se borró del todo." })
  await expect(final).toBeVisible()
  await expect(final.getByRole("button")).toHaveCount(0)
})

test("a material deleted while processing comes back with Deshacer ready to retry", async ({ page }) => {
  await borrarDesdeSuPagina(page, escena.procesando)
  await expect(aviso(page)).toContainText(`Borré «${LIDERAR}».`)
  // The run in flight sees the mark and lets the material go with its reason (plan D8).
  await pool.query(
    `update public.materiales set motivo_fallo = $2, corrida_id = null, corrida_desde = null
      where id = $1 and estado = 'procesando'`,
    [escena.procesando, MOTIVO_BORRADO_AL_PROCESAR],
  )
  await aviso(page).getByRole("button", { name: "Deshacer" }).click()
  await expect(recuperado(page)).toBeVisible()
  await expect(tarjetas(page).filter({ hasText: LIDERAR })).toContainText("En pausa")

  await page.goto(`/biblioteca/materiales/${escena.procesando}`)
  // The phone column and the desktop side column both draw the button; one of them is shown.
  await expect(page.getByText("En pausa", { exact: true }).filter({ visible: true })).toHaveCount(1)
  await expect(page.getByRole("button", { name: "Reintentar" }).filter({ visible: true })).toHaveCount(1)
})

test("deletes an author with nothing from its page, lands on Autores, and Deshacer brings it back", async ({
  page,
}) => {
  const autores = page.getByRole("list", { name: "Autores" }).getByRole("listitem")
  await page.goto("/biblioteca/autores")
  await expect(autores).toHaveCount(4)

  await page.goto(`/biblioteca/autores/${escena.sinMaterial}`)
  await page.getByRole("button", { name: "Borrar autor" }).click()
  await expect(page).toHaveURL(/\/biblioteca\/autores$/)
  await expect(aviso(page)).toHaveText(`Borré «${SIN_MATERIAL}».Deshacer`)
  await expect(aviso(page).getByRole("button", { name: "Deshacer" })).toBeFocused()
  await expect(autores).toHaveCount(3)
  expect(await revisarConAxe(page, "autores con el aviso de borrado")).toEqual([])

  await aviso(page).getByRole("button", { name: "Deshacer" }).click()
  await expect(recuperado(page)).toBeVisible()
  await expect(recuperado(page).getByRole("button")).toHaveCount(0)
  await expect(titulo(page)).toBeFocused()
  await expect(autores).toHaveCount(4)
})

test("never offers Borrar autor on an author with materials or on Coni's own card", async ({ page }) => {
  for (const id of [escena.autora, escena.coni]) {
    await page.goto(`/biblioteca/autores/${id}`)
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    await expect(page.getByRole("button", { name: "Borrar autor" })).toHaveCount(0)
  }
  expect(await revisarConAxe(page, "ficha de Coni")).toEqual([])
})
