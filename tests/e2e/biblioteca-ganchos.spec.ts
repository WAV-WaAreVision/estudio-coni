import { expect, type Page, test } from "@playwright/test"
import { pool } from "../integration/db"
import { bloquearRedExterna, irASeccion, revisarConAxe, tocarHastaLlegar } from "./ayudas"
import {
  AUTORA,
  type EscenaDeGanchos,
  GANCHO_ANTIGUO,
  GANCHO_INSTAGRAM,
  GANCHO_LINKEDIN,
  OTRA_AUTORA,
  PILAR,
  PILAR_SECUNDARIO,
  sembrarAutoresYTemas,
  sembrarGanchos,
  TEMA_PRINCIPAL,
} from "./biblioteca-escena"

let ganchos: EscenaDeGanchos

const tarjetas = (page: Page) => page.getByRole("list", { name: "Ganchos" }).getByRole("listitem")
const direccion = (consulta: string) => new RegExp(`/biblioteca/ganchos\\?${consulta}(?:&v=\\d+)?$`)

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await bloquearRedExterna(page)
  await sembrarAutoresYTemas()
  ganchos = await sembrarGanchos()
})

test("Ganchos is the fifth section: newest first, an old hook as «Sin clasificar», a card opens its page", async ({
  page,
}) => {
  await page.goto("/biblioteca")
  await irASeccion(page, "Ganchos", /\/biblioteca\/ganchos(?:[?&]v=\d+)?$/)
  await expect(tarjetas(page)).toHaveCount(3)
  await expect(tarjetas(page).nth(0)).toContainText(`«${GANCHO_ANTIGUO}»`)
  await expect(tarjetas(page).nth(0)).toContainText(`Sin clasificar · ${AUTORA}`)
  await expect(tarjetas(page).nth(1)).toContainText(`${GANCHO_INSTAGRAM.tipo} · ${OTRA_AUTORA}`)
  await expect(tarjetas(page).nth(2)).toContainText(`${GANCHO_LINKEDIN.tipo} · ${AUTORA}`)
  expect(await revisarConAxe(page, "ganchos en el celular")).toEqual([])

  await tocarHastaLlegar(
    page,
    tarjetas(page).nth(2).getByRole("link"),
    new RegExp(`/biblioteca/ganchos/${ganchos.linkedin}(?:\\?v=\\d+)?$`),
  )
  await expect(page.getByRole("heading", { level: 1, name: `«${GANCHO_LINKEDIN.frase}»` })).toBeVisible()
  await expect(page.getByText(GANCHO_LINKEDIN.sinGancho)).toBeVisible()
  await expect(page.getByRole("link", { name: TEMA_PRINCIPAL })).toHaveAttribute("href", /\/biblioteca\/temas\//)
  await expect(page.getByText(`${PILAR} · ${PILAR_SECUNDARIO}`)).toBeVisible()

  await page.goto(`/biblioteca/ganchos/${ganchos.antiguo}`)
  await expect(
    page.getByText("Sin clasificar: el tipo y la frase sin gancho llegan al reprocesar la Biblioteca."),
  ).toBeVisible()
  await expect(page.getByText("Sin red")).toBeVisible()
})

test("filters by type in «Más filtros», and by network, then a pillar of that network", async ({ page }) => {
  await page.goto("/biblioteca/ganchos")
  await page.waitForLoadState("networkidle")
  await page.getByText("Más filtros", { exact: true }).click()
  await page.getByLabel("Tipo").selectOption({ label: GANCHO_INSTAGRAM.tipo })
  await page.getByRole("button", { name: "Filtrar" }).click()
  await expect(page).toHaveURL(direccion("tipo=escena"))
  await expect(tarjetas(page)).toHaveCount(1)
  await tocarHastaLlegar(
    page,
    page.getByRole("link", { name: "Quitar estos filtros" }),
    /\/biblioteca\/ganchos(?:\?v=\d+)?$/,
  )
  await expect(tarjetas(page)).toHaveCount(3)

  const red = page.getByRole("group", { name: "Red" })
  await tocarHastaLlegar(page, red.getByRole("link", { name: "Sin red" }), direccion("red=sin_red"))
  await expect(tarjetas(page)).toHaveCount(1)
  await expect(tarjetas(page).nth(0)).toContainText(GANCHO_ANTIGUO)
  await tocarHastaLlegar(page, red.getByRole("link", { name: "LinkedIn" }), direccion("red=linkedin"))
  await expect(tarjetas(page)).toHaveCount(1)
  const pilares = page.getByRole("group", { name: "Pilar de LinkedIn" })
  await tocarHastaLlegar(
    page,
    pilares.getByRole("link", { name: PILAR_SECUNDARIO }),
    direccion("red=linkedin&pilar=[0-9a-f-]+"),
  )
  await expect(tarjetas(page)).toHaveCount(1)
  await expect(tarjetas(page).nth(0)).toContainText(GANCHO_LINKEDIN.frase)
  await tocarHastaLlegar(page, red.getByRole("link", { name: "Instagram" }), direccion("red=instagram"))
  await expect(tarjetas(page)).toHaveCount(1)
  await expect(tarjetas(page).nth(0)).toContainText(GANCHO_INSTAGRAM.frase)
})

test("marks and unmarks a favorite; a favorite goes first and «Solo favoritos» keeps it", async ({ page }) => {
  const esFavorito = async () =>
    (await pool.query("select 1 from public.ganchos_favoritos where afirmacion_id = $1", [ganchos.linkedin]))
      .rowCount === 1
  await page.goto(`/biblioteca/ganchos/${ganchos.linkedin}`)
  await page.waitForLoadState("networkidle")
  const estrella = page.getByRole("button", { name: "Favorito" })
  await expect(estrella).toHaveAttribute("aria-pressed", "false")
  await estrella.click()
  await expect(estrella).toHaveAttribute("aria-pressed", "true")
  expect(await esFavorito()).toBe(true)

  await page.goto("/biblioteca/ganchos")
  await expect(tarjetas(page).nth(0)).toContainText(GANCHO_LINKEDIN.frase)
  await expect(tarjetas(page).nth(0)).toContainText("Favorito")
  await tocarHastaLlegar(page, page.getByRole("link", { name: "Solo favoritos" }), direccion("favoritos=1"))
  await expect(tarjetas(page)).toHaveCount(1)

  await page.goto(`/biblioteca/ganchos/${ganchos.linkedin}`)
  await page.waitForLoadState("networkidle")
  await page.getByRole("button", { name: "Favorito" }).click()
  await expect(page.getByRole("button", { name: "Favorito" })).toHaveAttribute("aria-pressed", "false")
  expect(await esFavorito()).toBe(false)
})

test("«Mis tipos»: she picks her types, the filter shows up and keeps only those", async ({ page }) => {
  await page.goto("/biblioteca/ganchos")
  await expect(page.getByRole("link", { name: "Mis tipos" })).toHaveCount(0)
  await page.waitForLoadState("networkidle")
  await page.getByText("Elegir mis tipos", { exact: true }).click()
  await page.getByRole("checkbox", { name: GANCHO_LINKEDIN.tipo, exact: true }).check()
  await page.getByRole("checkbox", { name: GANCHO_INSTAGRAM.tipo, exact: true }).check()
  await page.getByRole("button", { name: "Guardar mis tipos" }).click()
  await expect(page.getByText("Guardé tus tipos.")).toBeVisible()
  const { rows } = await pool.query<{ t: string[] }>("select tipos_de_gancho_preferidos as t from public.ajustes")
  expect(rows[0]?.t).toEqual(["escena", "verdad_incomoda"])
  await tocarHastaLlegar(page, page.getByRole("link", { name: "Mis tipos" }), direccion("mis-tipos=1"))
  await expect(tarjetas(page)).toHaveCount(2)
})

test("says how hooks arrive when there are none, and offers to clear filters that match nothing", async ({ page }) => {
  await pool.query("delete from public.ganchos where afirmacion_id = any($1::uuid[])", [
    [ganchos.linkedin, ganchos.instagram],
  ])
  await pool.query("update public.afirmaciones set gancho = null where id = $1", [ganchos.antiguo])
  await page.goto("/biblioteca/ganchos")
  await expect(page.getByText("Los ganchos aparecen al procesar materiales.")).toBeVisible()

  await sembrarGanchos()
  await page.goto("/biblioteca/ganchos?tipo=escena&red=sin_red")
  await expect(page.getByText("Ningún gancho coincide con esos filtros.")).toBeVisible()
  await tocarHastaLlegar(
    page,
    page.getByRole("link", { name: "Quitar los filtros" }),
    /\/biblioteca\/ganchos(?:\?v=\d+)?$/,
  )
  await expect(tarjetas(page)).toHaveCount(3)
})
