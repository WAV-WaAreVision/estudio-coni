import { expect, type Page, test } from "@playwright/test"
import { pool } from "../integration/db"
import { ajustarPieza, vaciarPiezasEIdeas } from "../integration/siembra"
import { bloquearRedExterna, configurarServicios, revisarConAxe, simularMedios, TEXTO_LINKEDIN_VALIDO } from "./ayudas"
import { avatarYaVisto, PIEZAS, sembrarEscena } from "./escena"
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

// Gate 2 of a video on a computer, 1280 x 900 (critique 2026-11-05, puertas-escritorio). Measured, no baselines.
let video: string

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await bloquearRedExterna(page)
  await configurarServicios()
  await simularMedios(page)
  await avatarYaVisto()
  ;({ video } = await sembrarEscena())
  // LinkedIn and Instagram: the longest gate 2, with both texts to read.
  await ajustarPieza(video, { texto_linkedin: TEXTO_LINKEDIN_VALIDO })
  await pool.query("update public.ajustes set destinos_por_defecto = '{instagram,linkedin}'")
})

test.afterAll(async () => {
  await pool.query("update public.ajustes set destinos_por_defecto = '{instagram}'")
  await vaciarPiezasEIdeas()
})

async function abrir(page: Page) {
  await page.goto(`/video/${video}`)
  await expect(page.getByRole("heading", { name: PIEZAS.video.titulo, level: 1 })).toBeVisible()
}

const reproductor = (page: Page) => page.getByTestId("reproductor-video")
/** What she reviews: the video and the texts that go out with it. */
const lectura = (page: Page) => page.getByTestId("lectura-de-la-puerta")

test("the whole video fits the window at its own shape, with the signature beside it and never over it", async ({
  page,
}) => {
  await abrir(page)
  const alto = page.viewportSize()?.height ?? 900

  const marco = await cajaDe(reproductor(page))
  expect(marco.top).toBeGreaterThanOrEqual(0)
  expect(marco.bottom).toBeLessThanOrEqual(alto)
  expect(marco.width / marco.height).toBeCloseTo(9 / 16, 2)
  // Large enough to check lips and subtitles: well over the phone's 390 px column.
  expect(marco.height).toBeGreaterThan(640)

  const barra = await cajaDe(firmaDe(page))
  const falta = await cajaDe(firmaDe(page).getByText("Falta:"))
  expect(falta.top).toBeGreaterThanOrEqual(0)
  expect(barra.bottom).toBeLessThanOrEqual(alto)
  expect(barra.left).toBeGreaterThanOrEqual(marco.right)
  expect(barra.left).toBeGreaterThanOrEqual((await cajaDe(lectura(page))).right)
  // The check and the date are on screen with it: the steps the "Falta:" line names.
  expect((await cajaDe(page.getByRole("checkbox", { name: /Revisé labios/ }))).bottom).toBeLessThanOrEqual(alto)
  expect((await cajaDe(page.getByRole("heading", { name: "Dónde y cuándo" }))).bottom).toBeLessThanOrEqual(alto)
})

test("reading the LinkedIn text, the signature is still on screen and beside it", async ({ page }) => {
  await abrir(page)
  const alto = page.viewportSize()?.height ?? 900
  const texto = page.locator("section[aria-labelledby=texto-linkedin]")
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
    const marco = await cajaDe(reproductor(page))
    expect(marco.bottom, `${ancho} px`).toBeLessThanOrEqual(900)
  }
})

test("the video shares the left edge of «Inicio» and of the texts under it", async ({ page }) => {
  for (const ancho of [1024, 1280, 1440]) {
    await page.setViewportSize({ width: ancho, height: 900 })
    await abrir(page)
    const borde = (await cajaDe(reproductor(page))).left
    const inicio = (await cajaDe(page.getByRole("link", { name: "Inicio" }))).left
    expect(Math.abs(borde - inicio), `${ancho} px`).toBeLessThanOrEqual(1)
    expect(Math.abs(borde - (await cajaDe(lectura(page))).left), `${ancho} px`).toBeLessThanOrEqual(1)
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
  // The rail of the player is a thin range by design (decision 11): it is reached by the keyboard and by its 44 px strip.
  expect((await controlesBajos(page)).filter(({ nombre }) => nombre !== "Avance del video")).toEqual([])
})

test("axe finds nothing and the focus follows the steps: video, check, texts, date, signature", async ({ page }) => {
  await abrir(page)
  expect(await revisarConAxe(page, "puerta 2 del video en computador")).toEqual([])
  esperarEnOrden(await ordenDeFoco(page, 50), [
    "Inicio",
    "Reproducir el video",
    "Revisé labios",
    "Editar",
    "Así sale en Instagram",
    "Cambiar",
    "Más opciones",
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
  await capturarPuerta(page, "video-puerta-2", () => abrir(page))
})
