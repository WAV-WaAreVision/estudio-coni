import { expect, type Locator, type Page, test } from "@playwright/test"
import {
  marcarPublicacion,
  moverHoraAprobada,
  quitarPublicacion,
  sembrarIdea,
  sembrarPieza,
  vaciarPiezasEIdeas,
} from "../integration/siembra"
import { bloquearRedExterna, configurarServicios, limpiarPresupuesto } from "./ayudas"

// Ideas, Métricas, Calendario and Ajustes keep the phone's single column (issue 103, group B).
test.beforeEach(async ({ page }) => {
  await bloquearRedExterna(page)
  await vaciarPiezasEIdeas()
  await configurarServicios()
})

test.afterAll(async () => {
  await vaciarPiezasEIdeas()
  await limpiarPresupuesto()
})

async function caja(elemento: Locator, nombre: string) {
  const r = await elemento.boundingBox()
  if (!r) throw new Error(`${nombre}: sin caja`)
  return r
}

/** `despues` under `antes`, at the same left edge and width: one column in the phone's order. */
async function unaDebajoDeOtra(antes: Locator, despues: Locator, nombre: string) {
  const a = await caja(antes, nombre)
  const b = await caja(despues, nombre)
  expect(b.y, nombre).toBeGreaterThanOrEqual(a.y + a.height)
  expect(Math.abs(b.x - a.x), nombre).toBeLessThanOrEqual(1)
  expect(Math.abs(b.width - a.width), nombre).toBeLessThanOrEqual(1)
}

async function sinScrollDeLado(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)
}

test("Ideas keeps the count, the card and Más in one column, and the search results as rows", async ({ page }) => {
  await sembrarIdea({ pilar: "ia-salud-mental", gancho: "Si van a discutir, siéntense del mismo lado.", numero: 1 })
  await sembrarIdea({ pilar: "practica-clinica", gancho: "El deseo no se apaga: se esconde.", numero: 2 })
  await page.goto("/ideas")
  await expect(page.getByText(/^Idea 1 de 2$/)).toBeVisible()
  await unaDebajoDeOtra(page.getByTestId("idea-cuenta"), page.getByTestId("idea-actual"), "ideas cuenta")
  await unaDebajoDeOtra(page.getByTestId("idea-actual"), page.getByTestId("idea-lateral"), "ideas más")
  await sinScrollDeLado(page)

  await page.getByRole("button", { name: "Buscar" }).click()
  const resultados = page.getByRole("main").getByRole("listitem")
  await expect(resultados).toHaveCount(2)
  await unaDebajoDeOtra(resultados.nth(0), resultados.nth(1), "ideas buscar")
  await sinScrollDeLado(page)
})

test("Métricas keeps Instagram above LinkedIn", async ({ page }) => {
  const reel = await sembrarIdea({ pilar: "ia-salud-mental", gancho: "Un reel" })
  const reelId = await sembrarPieza("publicado", { titulo: "Un reel", idea_id: reel, media_id: "media_un_reel" })
  await moverHoraAprobada(reelId, new Date(Date.now() - 2 * 86_400_000).toISOString())
  const post = await sembrarIdea({ pilar: "etica-regulacion", gancho: "Lo que firma un modelo" })
  const id = await sembrarPieza("publicado", { titulo: "Lo que firma un modelo", idea_id: post })
  await quitarPublicacion(id, "instagram")
  await marcarPublicacion(id, "linkedin")
  await moverHoraAprobada(id, new Date(Date.now() - 2 * 86_400_000).toISOString())

  await page.goto("/metricas")
  await unaDebajoDeOtra(page.getByTestId("metricas-instagram"), page.getByTestId("metricas-linkedin"), "métricas")
  await sinScrollDeLado(page)
})

test("Calendario keeps Para subir under the month", async ({ page }) => {
  const idea = await sembrarIdea({ pilar: "caso-coni", gancho: "Por qué mi avatar dice que es un avatar" })
  await sembrarPieza("para_subir_a_mano", { titulo: "Por qué mi avatar dice que es un avatar", idea_id: idea })
  await page.goto("/calendario")
  await unaDebajoDeOtra(page.getByTestId("pagina-principal"), page.getByTestId("pagina-panel"), "calendario")
  await sinScrollDeLado(page)
})

test("Ajustes keeps its sections in one column", async ({ page }) => {
  await page.goto("/ajustes")
  await unaDebajoDeOtra(page.getByTestId("ajustes-izquierda"), page.getByTestId("ajustes-derecha"), "ajustes")
  await sinScrollDeLado(page)
})

for (const [ruta, nombre] of [
  ["/ajustes/cuentas", "cuentas"],
  ["/ajustes/datos-personales", "datos personales"],
  ["/ajustes/pagina-de-ia", "página de IA"],
] as const) {
  test(`${nombre} keeps its panel under the form`, async ({ page }) => {
    await page.goto(ruta)
    await unaDebajoDeOtra(page.getByTestId("pagina-principal"), page.getByTestId("pagina-panel"), nombre)
    await sinScrollDeLado(page)
  })
}

test("Presupuesto keeps Por proveedor between the cap and what spends on its own", async ({ page }) => {
  await limpiarPresupuesto()
  await page.goto("/ajustes/presupuesto")
  const panel = page.getByTestId("pagina-panel")
  await unaDebajoDeOtra(page.getByRole("region", { name: "Tope y límite" }), panel, "presupuesto tope")
  await unaDebajoDeOtra(panel, page.getByRole("region", { name: "Lo que gasta solo" }), "presupuesto solo")
  await sinScrollDeLado(page)
})
