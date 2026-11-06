import { expect, type Page, test } from "@playwright/test"
import { vaciarPiezasEIdeas } from "../integration/siembra"
import { bloquearRedExterna, configurarServicios, revisarConAxe, simularMedios } from "./ayudas"
import { CARRUSEL, sembrarCarruselDeEscena } from "./escena"
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

// Gate 2 of a carousel on a computer, 1280 x 900 (critique 2026-11-05, puertas-escritorio). Measured, no baselines.
let carrusel: string

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await bloquearRedExterna(page)
  await vaciarPiezasEIdeas()
  await configurarServicios()
  await simularMedios(page)
  carrusel = await sembrarCarruselDeEscena("carrusel_por_aprobar")
})

test.afterAll(async () => {
  await vaciarPiezasEIdeas()
})

async function abrir(page: Page) {
  await page.goto(`/guion/${carrusel}`)
  await expect(page.getByRole("heading", { name: CARRUSEL.titulo, level: 1 })).toBeVisible()
  await expect(page.getByRole("img", { name: /^Lámina 1 de 6/ })).toBeVisible()
}

const primeraLamina = (page: Page) => page.getByRole("img", { name: /^Lámina 1 de 6/ })
/** What she reviews: the slides and the post. */
const lectura = (page: Page) => page.getByTestId("lectura-de-la-puerta")

test("a whole slide shows at LinkedIn's size with the signature beside it, never over it", async ({ page }) => {
  await abrir(page)
  const alto = page.viewportSize()?.height ?? 900

  const lamina = await cajaDe(primeraLamina(page))
  // LinkedIn shows a carousel slide about 550 px wide on a computer: no smaller than a phone shows it, and all of it
  // on screen with the arrows under it.
  expect(lamina.width).toBeGreaterThan(400)
  expect(lamina.top).toBeGreaterThanOrEqual(0)
  expect((await cajaDe(page.getByRole("button", { name: "Lámina siguiente" }))).bottom).toBeLessThanOrEqual(alto)

  const barra = await cajaDe(firmaDe(page))
  const falta = await cajaDe(firmaDe(page).getByText("Falta:"))
  expect(falta.top).toBeGreaterThanOrEqual(0)
  expect(barra.bottom).toBeLessThanOrEqual(alto)
  expect(barra.left).toBeGreaterThanOrEqual((await cajaDe(lectura(page))).right)
  // The date she picks is on screen with the signature.
  expect((await cajaDe(page.getByRole("heading", { name: "Cuándo sale" }))).bottom).toBeLessThanOrEqual(alto)
})

test("reading the post, the signature is still on screen and beside it", async ({ page }) => {
  await abrir(page)
  const alto = page.viewportSize()?.height ?? 900
  const texto = page.locator("section[aria-labelledby=texto-del-post]")
  await texto.evaluate((nodo) => nodo.scrollIntoView({ block: "end" }))
  const barra = await cajaDe(firmaDe(page))
  expect(barra.top).toBeGreaterThanOrEqual(0)
  expect(barra.bottom).toBeLessThanOrEqual(alto)
  expect(barra.left).toBeGreaterThanOrEqual((await cajaDe(texto)).right)
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

for (const { width, height } of [
  { width: 1280, height: 780 },
  { width: 1440, height: 790 },
]) {
  test(`on a ${width} x ${height} window, scrolling the rail to its end reaches the last slide and opens the signature`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height })
    await abrir(page)
    const riel = page.getByRole("list", { name: "Láminas" })
    await riel.scrollIntoViewIfNeeded()
    const caja = await cajaDe(riel)
    // A trackpad swipe, not the arrows: the wheel moves the rail sideways until it stops.
    await page.mouse.move(caja.left + caja.width / 2, caja.top + caja.height / 2)
    for (let i = 0; i < 12; i++) await page.mouse.wheel(400, 0)
    await expect(page.getByText("Lámina 6 de 6")).toBeVisible()
    await expect(firmaDe(page).getByRole("slider", { name: "Desliza para programar" })).toHaveAttribute(
      "aria-disabled",
      "false",
    )
  })
}

test("a phone on its side keeps one column, with each slide at least 16 rem wide", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 })
  await abrir(page)
  expect(await sobraDeAncho(page)).toBeLessThanOrEqual(0)
  const lamina = await cajaDe(primeraLamina(page))
  const rem = await page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize))
  expect(lamina.width).toBeGreaterThanOrEqual(16 * rem)
  // The signature is under what she reads, not beside it.
  const firma = firmaDe(page)
  await firma.scrollIntoViewIfNeeded()
  expect((await cajaDe(firma)).left).toBeLessThan((await cajaDe(lectura(page))).right)
})

test("every control is at least 44 px tall", async ({ page }) => {
  await abrir(page)
  expect(await controlesBajos(page)).toEqual([])
})

test("axe finds nothing and the focus follows the steps: slides, post, date, signature", async ({ page }) => {
  await abrir(page)
  expect(await revisarConAxe(page, "puerta 2 del carrusel en computador")).toEqual([])
  esperarEnOrden(await ordenDeFoco(page), [
    "Inicio",
    "Láminas",
    "Lámina siguiente",
    "Pedir cambio",
    "Cambiar",
    "Descartar",
    "Desliza para programar",
  ])
})

test("with a large default text size the gate falls back to one column and the signature is reachable", async ({
  page,
}) => {
  await abrir(page)
  await conTextoDoble(page)
  expect(await sobraDeAncho(page)).toBeLessThanOrEqual(0)
  // One column, the phone's: 560 px less the page's gutters, never a line as wide as the screen.
  const ancho = (await cajaDe(lectura(page))).width
  expect(ancho).toBeGreaterThan(400)
  expect(ancho).toBeLessThanOrEqual(520)
  const firma = firmaDe(page).getByRole("slider", { name: "Desliza para programar" })
  await firma.scrollIntoViewIfNeeded()
  await expect(firma).toBeInViewport()
})

test("captures for the review", async ({ page }) => {
  test.skip(!process.env.CAPTURAS_PUERTAS, "Only when CAPTURAS_PUERTAS asks for the review captures.")
  await capturarPuerta(page, "carrusel-puerta-2", () => abrir(page))
})
