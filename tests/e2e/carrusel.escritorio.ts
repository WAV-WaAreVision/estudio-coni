import { expect, type Page, test } from "@playwright/test"
import { vaciarPiezasEIdeas } from "../integration/siembra"
import { bloquearRedExterna, configurarServicios, revisarConAxe } from "./ayudas"
import { CARRUSEL, conAngulo, sembrarCarruselDeEscena } from "./escena"
import {
  cajaDe,
  capturarPuerta,
  conBarraClasica,
  conTextoDoble,
  controlesBajos,
  esperarEnOrden,
  firmaDe,
  ordenDeFoco,
  sobraDeAncho,
} from "./medidas-de-escritorio"

// Gate 1 of a carousel on a computer, 1280 x 900 (critique 2026-11-05, puertas-escritorio). Measured, no baselines.
const ADVERTENCIA = {
  regla: "largo_lamina",
  tipo: "advierte",
  mensaje: "La lámina 2 tiene 230 caracteres. Cabe bien hasta 220.",
}

let carrusel: string

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await bloquearRedExterna(page)
  await vaciarPiezasEIdeas()
  await configurarServicios()
  // A warning to tick: the signature says what is missing.
  carrusel = await sembrarCarruselDeEscena("guion_por_aprobar", { revision: [ADVERTENCIA] })
  await conAngulo(carrusel, "psicologia-en-la-mesa", "lo-que-construyo")
})

test.afterAll(async () => {
  await vaciarPiezasEIdeas()
})

async function abrir(page: Page) {
  await page.goto(`/guion/${carrusel}`)
  await expect(page.getByRole("heading", { name: CARRUSEL.titulo, level: 1 })).toBeVisible()
}

/** What she reads: the slides and the post with its review. */
const lectura = (page: Page) => page.getByTestId("lectura-de-la-puerta")

test("the slides and the post read on the left and the signature sits on the right, never over them", async ({
  page,
}) => {
  await abrir(page)
  const alto = page.viewportSize()?.height ?? 900

  const barra = await cajaDe(firmaDe(page))
  const falta = await cajaDe(firmaDe(page).getByText("Falta:"))
  const leido = await cajaDe(lectura(page))

  expect(falta.top).toBeGreaterThanOrEqual(0)
  expect(barra.bottom).toBeLessThanOrEqual(alto)
  expect(barra.left).toBeGreaterThanOrEqual(leido.right)
  // A comfortable line for the slides and the post: about 65 to 75 characters at 17 px.
  expect(leido.width).toBeGreaterThan(560)
  expect(leido.width).toBeLessThanOrEqual(700)

  // Reading down to the post's review, the signature is still on screen and still beside it.
  await page.getByRole("checkbox", { name: "Lo revisé y está bien" }).scrollIntoViewIfNeeded()
  const abajo = await cajaDe(firmaDe(page))
  expect(abajo.top).toBeGreaterThanOrEqual(0)
  expect(abajo.bottom).toBeLessThanOrEqual(alto)
  expect(abajo.left).toBeGreaterThanOrEqual((await cajaDe(lectura(page))).right)
})

test("no width scrolls sideways, from a tablet to a wide screen", async ({ page }) => {
  for (const ancho of [768, 1024, 1280, 1440]) {
    await page.setViewportSize({ width: ancho, height: 900 })
    await abrir(page)
    expect(await sobraDeAncho(page), `${ancho} px`).toBeLessThanOrEqual(0)
    expect((await cajaDe(firmaDe(page))).left, `${ancho} px`).toBeGreaterThanOrEqual(
      (await cajaDe(lectura(page))).right,
    )
  }
})

test("a 768 px window with a classic scrollbar still shows the two columns", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 })
  await abrir(page)
  await conBarraClasica(page)
  expect(await page.evaluate(() => document.body.getBoundingClientRect().width)).toBe(753)
  expect(await sobraDeAncho(page)).toBeLessThanOrEqual(0)
  expect((await cajaDe(firmaDe(page))).left).toBeGreaterThanOrEqual((await cajaDe(lectura(page))).right)
})

test("every control is at least 44 px tall", async ({ page }) => {
  await abrir(page)
  expect(await controlesBajos(page)).toEqual([])
})

test("axe finds nothing and the focus follows the steps: angle, post, Pedir cambio, signature", async ({ page }) => {
  await abrir(page)
  expect(await revisarConAxe(page, "puerta 1 del carrusel en computador")).toEqual([])
  esperarEnOrden(await ordenDeFoco(page), [
    "Inicio",
    "Lo que construyo",
    "Lo revisé y está bien",
    "Pedir cambio",
    "Descartar",
    "Desliza para firmar",
  ])
})

test("with a large default text size the gate falls back to one column and the signature is reachable", async ({
  page,
}) => {
  await abrir(page)
  await conTextoDoble(page)
  expect(await sobraDeAncho(page)).toBeLessThanOrEqual(0)
  expect((await cajaDe(lectura(page))).width).toBeGreaterThan(1000)
  const firma = firmaDe(page).getByRole("slider", { name: "Desliza para firmar" })
  await firma.scrollIntoViewIfNeeded()
  await expect(firma).toBeInViewport()
})

test("captures for the review", async ({ page }) => {
  test.skip(!process.env.CAPTURAS_PUERTAS, "Only when CAPTURAS_PUERTAS asks for the review captures.")
  await capturarPuerta(page, "carrusel-puerta-1", () => abrir(page))
})
