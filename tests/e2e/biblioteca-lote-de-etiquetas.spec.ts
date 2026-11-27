import { expect, type Page, test } from "@playwright/test"
import { pool } from "../integration/db"
import { bloquearRedExterna, revisarConAxe } from "./ayudas"
import {
  type EscenaDeEtiquetas,
  GANCHO_INSTAGRAM,
  GANCHO_LINKEDIN,
  IDEA_DE_CONI,
  sembrarAutoresYTemas,
  sembrarLoteDeEtiquetas,
  sinEtiquetasDudosas,
} from "./biblioteca-escena"

let escena: EscenaDeEtiquetas

const tarjeta = (page: Page, texto: string) => page.getByRole("article").filter({ hasText: texto })

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await bloquearRedExterna(page)
  await sembrarAutoresYTemas()
  escena = await sembrarLoteDeEtiquetas()
})

test.afterEach(() => sinEtiquetasDudosas())

test("goes from Inicio's line to the batch, confirms one, corrects two, and ends the week", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByText("Tienes 3 etiquetas para revisar")).toBeVisible()
  await page.getByRole("link", { name: "Revisar etiquetas" }).click()
  await expect(page).toHaveURL(/\/biblioteca\/etiquetas\/revisar$/)
  await expect(page.getByRole("heading", { level: 1, name: "Etiquetas para revisar" })).toBeVisible()
  await expect(page.getByText("0 de 3")).toBeVisible()
  await expect(page.getByRole("article")).toHaveCount(3)
  expect(await revisarConAxe(page, "etiquetas para revisar en el celular")).toEqual([])
  await page.waitForLoadState("networkidle")

  // The hook type: «Está bien».
  await tarjeta(page, "Tipo de gancho sugerido").getByRole("button", { name: "Está bien" }).click()
  await expect(tarjeta(page, GANCHO_INSTAGRAM.frase).getByText("Confirmada por ti")).toBeVisible()
  await expect(page.getByText("1 de 3")).toBeVisible()

  // The LinkedIn emotion: «Cambiar» opens the 6c-1 list.
  const emocion = tarjeta(page, GANCHO_LINKEDIN.frase)
  await expect(emocion).toContainText("Claude no estaba segura")
  await emocion.getByRole("button", { name: "Cambiar" }).click()
  await emocion.getByRole("radio", { name: "Curiosidad" }).check()
  await emocion.getByRole("button", { name: "Cambiar", exact: true }).click()
  await expect(tarjeta(page, GANCHO_LINKEDIN.frase).getByText("Corregida por ti")).toBeVisible()
  const marca = await pool.query<{ id: string; valor: string; origen: string }>(
    "select id, valor, origen from public.afirmacion_marcas where afirmacion_id = $1 and marca = 'emocion' and red = 'linkedin'",
    [escena.nueva],
  )
  expect(marca.rows.map((m) => [m.valor, m.origen])).toEqual([["curiosidad", "coni"]])
  const registro = await pool.query(
    "select accion, marca_id from public.correcciones_de_etiqueta where afirmacion_id = $1 and campo = 'emocion'",
    [escena.nueva],
  )
  expect(registro.rows).toEqual([{ accion: "corrige", marca_id: marca.rows[0]?.id }])

  // The old claim's tipo: no «Está bien»; the claim and back.
  const tipo = tarjeta(page, IDEA_DE_CONI)
  await expect(tipo).toContainText("Quedó sin clasificar")
  await expect(tipo.getByRole("button", { name: "Está bien" })).toHaveCount(0)
  await tipo.getByRole("link", { name: "Ver la afirmación" }).click()
  await expect(page).toHaveURL(new RegExp(`/biblioteca/afirmaciones/${escena.antigua}\\?desde=`))
  await page.getByRole("link", { name: "Etiquetas para revisar" }).click()
  await expect(page).toHaveURL(/\/biblioteca\/etiquetas\/revisar$/)
  await page.waitForLoadState("networkidle")
  await tarjeta(page, IDEA_DE_CONI).getByRole("button", { name: "Cambiar" }).click()
  await tarjeta(page, IDEA_DE_CONI).getByRole("radio", { name: "Consejo" }).check()
  await tarjeta(page, IDEA_DE_CONI).getByRole("button", { name: "Cambiar", exact: true }).click()
  await expect(tarjeta(page, IDEA_DE_CONI).getByText("Corregida por ti")).toBeVisible()

  await expect(page.getByText("Listo por esta semana. El próximo lote llega el lunes.")).toBeVisible()
  await expect(page.getByText("3 de 3")).toBeVisible()
  // The bottom bar is sticky: mid-page it overlaps a card's link, an artefact of that scroll position (as in
  // biblioteca-enlaces.spec.ts). At the end of the page it sits in the flow, so the batch is checked there.
  await expect
    .poll(() =>
      page.evaluate(() => {
        window.scrollTo(0, document.documentElement.scrollHeight)
        return Math.ceil(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight
      }),
    )
    .toBe(true)
  expect(await revisarConAxe(page, "lote terminado en el celular")).toEqual([])

  await page.goto("/")
  await expect(page.getByText(/etiquetas? para revisar/)).toHaveCount(0)
})

test("says there is nothing to review in a week with no doubtful tag, and Inicio says nothing", async ({ page }) => {
  await sinEtiquetasDudosas()
  await page.goto("/biblioteca/etiquetas/revisar")
  await expect(page.getByText("No hay etiquetas dudosas esta semana.")).toBeVisible()
  await expect(page.getByRole("article")).toHaveCount(0)
  await page.goto("/")
  await expect(page.getByText(/etiquetas? para revisar/)).toHaveCount(0)
})
