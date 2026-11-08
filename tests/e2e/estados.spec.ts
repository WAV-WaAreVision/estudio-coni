import { expect, type Page, test } from "@playwright/test"
import { sembrarPieza, vaciarPiezasEIdeas } from "../integration/siembra"
import { bloquearRedExterna, configurarServicios, simularMedios } from "./ayudas"
import { avatarYaVisto, sembrarCarruselDeEscena } from "./escena"

// The piece states with nothing to sign keep the phone's single column (issue 103, group A).
test.beforeEach(async ({ page }) => {
  await bloquearRedExterna(page)
  await vaciarPiezasEIdeas()
  await configurarServicios()
  await simularMedios(page)
  await avatarYaVisto()
})

test.afterAll(async () => {
  await vaciarPiezasEIdeas()
})

/** One column, in the phone's order: the card (title), the state, then the side actions. */
async function revisarUnaColumna(page: Page, nombre: string, { conLateral }: { conLateral: boolean }) {
  const pieza = await page.getByTestId("estado-pieza").boundingBox()
  const principal = await page.getByTestId("estado-principal").boundingBox()
  if (!pieza || !principal) throw new Error(`${nombre}: sin cajas`)
  expect(principal.y, nombre).toBeGreaterThanOrEqual(pieza.y + pieza.height)
  expect(Math.abs(principal.x - pieza.x), nombre).toBeLessThanOrEqual(1)
  expect(Math.abs(principal.width - pieza.width), nombre).toBeLessThanOrEqual(1)
  if (conLateral) {
    const lateral = await page.getByTestId("estado-lateral").boundingBox()
    if (!lateral) throw new Error(`${nombre}: sin lateral`)
    expect(lateral.y, nombre).toBeGreaterThanOrEqual(principal.y + principal.height)
    expect(Math.abs(lateral.x - principal.x), nombre).toBeLessThanOrEqual(1)
    // The same 24 px between the state and its actions as before the slots.
    expect(Math.round(lateral.y - (principal.y + principal.height)), nombre).toBe(24)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)
}

test("a failed video keeps one column with Descartar after the error", async ({ page }) => {
  const id = await sembrarPieza("en_render", {
    estado: "error_produccion",
    estado_antes_del_error: "en_render",
    explicacion: "HeyGen no pudo terminar el video",
  })
  await page.goto(`/guion/${id}`)
  await expect(page.getByText("No pude terminar el video.")).toBeVisible()
  await revisarUnaColumna(page, "guion error de producción", { conLateral: true })
})

test("a scheduled video keeps one column with its actions last", async ({ page }) => {
  const id = await sembrarPieza("programado")
  await page.goto(`/video/${id}`)
  await expect(page.getByText(/^Programado para el/)).toBeVisible()
  await revisarUnaColumna(page, "video programado", { conLateral: true })
})

test("a carousel being put together keeps one column", async ({ page }) => {
  const id = await sembrarCarruselDeEscena("armando_carrusel")
  await page.goto(`/guion/${id}`)
  await expect(page.getByRole("heading", { name: "Así quedó firmado" })).toBeVisible()
  await revisarUnaColumna(page, "carrusel armando", { conLateral: false })
})
