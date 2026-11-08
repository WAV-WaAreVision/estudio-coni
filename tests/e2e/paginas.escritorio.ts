import { expect, type Locator, type Page, test } from "@playwright/test"
import { pool } from "../integration/db"
import {
  marcarPublicacion,
  moverHoraAprobada,
  quitarPublicacion,
  sembrarIdea,
  sembrarPieza,
  vaciarPiezasEIdeas,
} from "../integration/siembra"
import { bloquearRedExterna, configurarServicios, limpiarPresupuesto, revisarConAxe } from "./ayudas"
import { type Caja, cajaDe, sobraDeAncho } from "./medidas-de-escritorio"

// Ideas, Métricas, Calendario and Ajustes on a computer, 1440 x 900 (issue 103, group B). Measured, no baselines.
test.use({ viewport: { width: 1440, height: 900 } })

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await bloquearRedExterna(page)
  await vaciarPiezasEIdeas()
  await configurarServicios()
})

test.afterAll(async () => {
  await vaciarPiezasEIdeas()
  await limpiarPresupuesto()
})

/** 75ch of the body text, measured inside `dentro`. */
function anchoDeLectura(dentro: Locator): Promise<number> {
  return dentro.evaluate((nodo) => {
    const regla = document.createElement("p")
    regla.className = "text-cuerpo"
    regla.style.width = "75ch"
    nodo.append(regla)
    const ancho = regla.getBoundingClientRect().width
    regla.remove()
    return ancho
  })
}

/** One rem in pixels: the app's root size is not 16 px. */
function rem(page: Page): Promise<number> {
  return page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize))
}

/** Two boxes side by side from the same top, the pair wider than 900 px. */
function ladoALado(izquierda: Caja, derecha: Caja, nombre: string): void {
  expect(derecha.left, nombre).toBeGreaterThanOrEqual(izquierda.right)
  expect(Math.abs(derecha.top - izquierda.top), nombre).toBeLessThanOrEqual(1)
  expect(derecha.right - izquierda.left, nombre).toBeGreaterThan(900)
}

/** The page widens, never scrolls sideways and has no axe violations. */
async function revisarPagina(page: Page, nombre: string): Promise<void> {
  await expect(page.locator("[data-ancho=pagina]")).toHaveCount(1)
  expect(await sobraDeAncho(page), nombre).toBeLessThanOrEqual(0)
  expect(await revisarConAxe(page, nombre)).toEqual([])
}

/** A form page: the form at reading width (≤ 42rem) on the left, a 20rem panel on the right. */
async function revisarFormularioYPanel(
  page: Page,
  nombre: string,
  formulario: Locator = page.getByTestId("pagina-principal"),
): Promise<void> {
  const principal = await cajaDe(formulario)
  const panel = await cajaDe(page.getByTestId("pagina-panel"))
  ladoALado(principal, panel, nombre)
  const unRem = await rem(page)
  expect(principal.width, nombre).toBeLessThanOrEqual(42 * unRem + 1)
  expect(principal.width, nombre).toBeLessThanOrEqual((await anchoDeLectura(formulario)) + 1)
  expect(Math.round(panel.width), nombre).toBe(Math.round(20 * unRem))
  // The intro under the title stays at the form's width.
  const intro = await cajaDe(page.locator("main h1 + p"))
  expect(intro.width, nombre).toBeLessThanOrEqual(principal.width + 1)
  await revisarPagina(page, nombre)
}

async function sembrarBanco() {
  await sembrarIdea({ pilar: "ia-salud-mental", gancho: "Si van a discutir, siéntense del mismo lado.", numero: 1 })
  await sembrarIdea({ pilar: "practica-clinica", gancho: "El deseo no se apaga: se esconde.", numero: 2 })
  await sembrarIdea({ pilar: "etica-regulacion", gancho: "¿Por qué sientes culpa al descansar?", numero: 3 })
  await sembrarIdea({ pilar: "caso-coni", gancho: "Cuando tu mente inventa lo peor", numero: 4 })
}

test("Ideas puts the card at reading width and its count and Más beside it", async ({ page }) => {
  await sembrarBanco()
  await page.goto("/ideas")
  await expect(page.getByText(/^Idea 1 de 4$/)).toBeVisible()
  const carta = await cajaDe(page.getByTestId("idea-actual"))
  const cuenta = await cajaDe(page.getByTestId("idea-cuenta"))
  const lateral = await cajaDe(page.getByTestId("idea-lateral"))
  ladoALado(carta, cuenta, "ideas mazo")
  expect(carta.width).toBeLessThanOrEqual(40 * (await rem(page)) + 1)
  // Más under the count, in the same column.
  expect(Math.abs(lateral.left - cuenta.left)).toBeLessThanOrEqual(1)
  expect(lateral.top).toBeGreaterThanOrEqual(cuenta.bottom)
  await expect(page.getByTestId("idea-cuenta")).toContainText("Idea 1 de 4")
  await expect(page.getByTestId("idea-lateral").getByText("Más")).toBeVisible()
  await revisarPagina(page, "ideas mazo")
})

test("Ideas lays the search results and Elegir varias out as a grid of cards", async ({ page }) => {
  await sembrarBanco()
  await page.goto("/ideas")
  await page.getByRole("button", { name: "Buscar" }).click()
  const resultados = page.getByRole("main").getByRole("listitem")
  await expect(resultados).toHaveCount(4)
  ladoALado(await cajaDe(resultados.nth(0)), await cajaDe(resultados.nth(2)), "ideas buscar")
  const minimo = 18 * (await rem(page))
  for (const i of [0, 1, 2]) expect((await cajaDe(resultados.nth(i))).width).toBeGreaterThanOrEqual(minimo)
  await revisarPagina(page, "ideas buscar")

  await page.getByRole("button", { name: "Una a la vez" }).click()
  await page.getByRole("button", { name: "Elegir varias" }).click()
  const filas = page.getByRole("main").getByRole("listitem")
  await expect(filas).toHaveCount(4)
  ladoALado(await cajaDe(filas.nth(0)), await cajaDe(filas.nth(2)), "ideas elegir varias")
  await revisarPagina(page, "ideas elegir varias")
})

test("Métricas puts the month's figures on top and Instagram beside LinkedIn", async ({ page }) => {
  const reel = await sembrarIdea({ pilar: "ia-salud-mental", gancho: "Un reel" })
  const reelId = await sembrarPieza("publicado", { titulo: "Un reel", idea_id: reel, media_id: "media_un_reel" })
  await moverHoraAprobada(reelId, new Date(Date.now() - 2 * 86_400_000).toISOString())
  const post = await sembrarIdea({ pilar: "etica-regulacion", gancho: "Lo que firma un modelo" })
  const id = await sembrarPieza("publicado", { titulo: "Lo que firma un modelo", idea_id: post })
  await quitarPublicacion(id, "instagram")
  await marcarPublicacion(id, "linkedin")
  await moverHoraAprobada(id, new Date(Date.now() - 2 * 86_400_000).toISOString())

  await page.goto("/metricas")
  await expect(page.getByRole("heading", { name: "LinkedIn" })).toBeVisible()
  ladoALado(
    await cajaDe(page.getByTestId("metricas-instagram")),
    await cajaDe(page.getByTestId("metricas-linkedin")),
    "métricas redes",
  )
  // The published reel gives the page a theme comparison: the month's figures sit beside it, both above the networks.
  const comparacion = page.getByTestId("metricas-comparacion")
  await expect(comparacion).toBeVisible()
  ladoALado(await cajaDe(page.getByTestId("metricas-cabecera")), await cajaDe(comparacion), "métricas cifras")
  const cifras = await cajaDe(page.getByTestId("metricas-cifras"))
  expect(cifras.bottom).toBeLessThanOrEqual((await cajaDe(page.getByTestId("metricas-instagram"))).top)
  await revisarPagina(page, "métricas")
})

test("Calendario puts the month on the left and Para subir in a side panel", async ({ page }) => {
  const idea = await sembrarIdea({ pilar: "caso-coni", gancho: "Por qué mi avatar dice que es un avatar" })
  await sembrarPieza("para_subir_a_mano", { titulo: "Por qué mi avatar dice que es un avatar", idea_id: idea })

  await page.goto("/calendario")
  const panel = page.getByRole("region", { name: "Para subir" })
  await expect(panel).toBeVisible()
  const principal = await cajaDe(page.getByTestId("pagina-principal"))
  const lateral = await cajaDe(page.getByTestId("pagina-panel"))
  ladoALado(principal, lateral, "calendario")
  expect(Math.round(lateral.width)).toBe(Math.round(20 * (await rem(page))))
  await revisarPagina(page, "calendario")
})

test("Calendario keeps Agenda and its tabs at reading width, the tabs as wide as over the month", async ({ page }) => {
  const idea = await sembrarIdea({ pilar: "etica-regulacion", gancho: "Lo que firma un modelo" })
  await sembrarPieza("video_por_aprobar", { titulo: "Lo que firma un modelo", idea_id: idea })
  const pestanas = page.getByRole("navigation", { name: "Vista del calendario" })

  await page.goto("/calendario")
  await expect(pestanas).toBeVisible()
  const sobreElMes = await cajaDe(pestanas)

  await page.goto("/calendario?vista=agenda")
  const fila = page.getByRole("link", { name: /Lo que firma un modelo/ })
  await expect(fila).toBeVisible()
  const enLaAgenda = await cajaDe(pestanas)
  expect(Math.round(enLaAgenda.left)).toBe(Math.round(sobreElMes.left))
  expect(Math.round(enLaAgenda.width)).toBe(Math.round(sobreElMes.width))
  const lectura = await anchoDeLectura(page.getByRole("main"))
  expect(enLaAgenda.width).toBeLessThanOrEqual(lectura + 1)
  // The row's date and its arrow stay within reading distance of each other.
  const renglon = await cajaDe(fila)
  expect(renglon.width).toBeLessThanOrEqual(lectura + 1)
  expect(renglon.left).toBeGreaterThanOrEqual(enLaAgenda.left - 1)
  expect(renglon.right).toBeLessThanOrEqual(enLaAgenda.right + 1)
  await revisarPagina(page, "calendario agenda")
})

test("Ajustes lays its sections out in two columns", async ({ page }) => {
  await page.goto("/ajustes")
  await expect(page.getByRole("heading", { name: "Publicación", exact: true })).toBeVisible()
  ladoALado(
    await cajaDe(page.getByTestId("ajustes-izquierda")),
    await cajaDe(page.getByTestId("ajustes-derecha")),
    "ajustes",
  )
  await expect(page.getByTestId("ajustes-derecha").getByRole("heading", { name: "Gasto" })).toBeVisible()
  await revisarPagina(page, "ajustes")
})

test("Cuentas keeps the accounts at reading width and the balances in the panel", async ({ page }) => {
  await page.goto("/ajustes/cuentas")
  await expect(page.getByTestId("pagina-panel").getByRole("heading", { name: "Saldos" })).toBeVisible()
  await revisarFormularioYPanel(page, "cuentas")
})

test("Datos personales keeps the register at reading width and the yearly review in the panel", async ({ page }) => {
  await page.goto("/ajustes/datos-personales")
  await expect(page.getByTestId("pagina-panel").getByRole("button", { name: "Lo revisé" })).toBeVisible()
  await revisarFormularioYPanel(page, "datos personales")
})

test("Página de IA keeps the editor at reading width and the line for the bio in the panel", async ({ page }) => {
  await page.goto("/ajustes/pagina-de-ia")
  await expect(page.getByTestId("pagina-panel").getByRole("heading", { name: "Para tu bio" })).toBeVisible()
  await revisarFormularioYPanel(page, "página de IA")
})

test("Presupuesto keeps the cap and limit at reading width and Por proveedor in the panel", async ({ page }) => {
  await limpiarPresupuesto()
  await pool.query("delete from public.limites_del_mes")
  await page.goto("/ajustes/presupuesto")
  await expect(page.getByTestId("pagina-panel").getByRole("heading", { name: "Por proveedor" })).toBeVisible()
  // «Por proveedor» sits between the cap and what spends on its own on a phone: the form is its sections, not one box.
  await revisarFormularioYPanel(page, "presupuesto", page.getByRole("region", { name: "Este mes" }))
})
