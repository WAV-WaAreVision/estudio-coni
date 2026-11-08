import { expect, type Page, test } from "@playwright/test"
import { sembrarPieza, vaciarPiezasEIdeas } from "../integration/siembra"
import { bloquearRedExterna, configurarServicios, revisarConAxe, simularMedios } from "./ayudas"
import { avatarYaVisto, sembrarCarruselDeEscena } from "./escena"
import { cajaDe, sobraDeAncho } from "./medidas-de-escritorio"

// The piece states with nothing to sign on a computer, 1440 x 900 (issue 103, group A). Measured, no baselines.
test.use({ viewport: { width: 1440, height: 900 } })

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await bloquearRedExterna(page)
  await vaciarPiezasEIdeas()
  await configurarServicios()
  await simularMedios(page)
  await avatarYaVisto()
})

test.afterAll(async () => {
  await vaciarPiezasEIdeas()
})

/** 75ch of the body text, measured inside the main column. */
function anchoDeLectura(page: Page): Promise<number> {
  return page.getByTestId("estado-principal").evaluate((nodo) => {
    const regla = document.createElement("p")
    regla.className = "text-cuerpo"
    regla.style.width = "75ch"
    nodo.append(regla)
    const ancho = regla.getBoundingClientRect().width
    regla.remove()
    return ancho
  })
}

/** The state on the left at reading width, the piece's card on the right, the side actions under the card. */
async function revisarDosColumnas(page: Page, nombre: string, { conLateral }: { conLateral: boolean }) {
  const principal = await cajaDe(page.getByTestId("estado-principal"))
  const pieza = await cajaDe(page.getByTestId("estado-pieza"))
  expect(pieza.left, nombre).toBeGreaterThanOrEqual(principal.right)
  expect(Math.abs(pieza.top - principal.top), nombre).toBeLessThanOrEqual(1)
  // The screen uses the computer's width, while what she reads stays at reading width.
  expect(pieza.right - principal.left, nombre).toBeGreaterThan(900)
  expect(principal.width, nombre).toBeLessThanOrEqual((await anchoDeLectura(page)) + 1)
  if (conLateral) {
    const lateral = await cajaDe(page.getByTestId("estado-lateral"))
    expect(Math.abs(lateral.left - pieza.left), nombre).toBeLessThanOrEqual(1)
    expect(lateral.top, nombre).toBeGreaterThanOrEqual(pieza.bottom)
    // Under the card, not pushed down by a long state on the left.
    expect(lateral.top - pieza.bottom, nombre).toBeLessThanOrEqual(24)
  } else {
    await expect(page.getByTestId("estado-lateral")).toHaveCount(0)
  }
  expect(await sobraDeAncho(page), nombre).toBeLessThanOrEqual(0)
  expect(await revisarConAxe(page, nombre)).toEqual([])
}

test("a script being written uses two columns", async ({ page }) => {
  const id = await sembrarPieza("guion_en_proceso")
  await page.goto(`/guion/${id}`)
  await expect(page.getByText("Estoy escribiendo el guion")).toBeVisible()
  await revisarDosColumnas(page, "guion escribiendo", { conLateral: false })
})

test("a failed video keeps the error on the left and Descartar under the card", async ({ page }) => {
  const id = await sembrarPieza("en_render", {
    estado: "error_produccion",
    estado_antes_del_error: "en_render",
    explicacion: "HeyGen no pudo terminar el video",
  })
  await page.goto(`/guion/${id}`)
  await expect(page.getByText("No pude terminar el video.")).toBeVisible()
  await expect(page.getByTestId("estado-principal").getByRole("button", { name: "Reintentar" })).toBeVisible()
  await expect(page.getByTestId("estado-lateral").getByRole("button", { name: "Descartar esta pieza" })).toBeVisible()
  await revisarDosColumnas(page, "guion error de producción", { conLateral: true })
})

test("a scheduled video has its steps on the left and the date and Descartar under the card", async ({ page }) => {
  const id = await sembrarPieza("programado")
  await page.goto(`/video/${id}`)
  await expect(page.getByText(/^Programado para el/)).toBeVisible()
  await expect(page.getByTestId("estado-lateral").getByRole("button", { name: "Descartar esta pieza" })).toBeVisible()
  await revisarDosColumnas(page, "video programado", { conLateral: true })
})

test("a video to upload by hand has its steps on the left", async ({ page }) => {
  const id = await sembrarPieza("para_subir_a_mano")
  await page.goto(`/video/${id}`)
  await expect(page.getByText(/^Listo para que lo subas a/)).toBeVisible()
  await revisarDosColumnas(page, "video para subir a mano", { conLateral: true })
})

test("a published video uses two columns", async ({ page }) => {
  const id = await sembrarPieza("publicado")
  await page.goto(`/video/${id}`)
  await expect(page.getByText("Ya se publicó")).toBeVisible()
  await revisarDosColumnas(page, "video publicado", { conLateral: false })
})

test("a carousel being put together shows its slides on the left", async ({ page }) => {
  const id = await sembrarCarruselDeEscena("armando_carrusel")
  await page.goto(`/guion/${id}`)
  await expect(page.getByRole("heading", { name: "Así quedó firmado" })).toBeVisible()
  await revisarDosColumnas(page, "carrusel armando", { conLateral: false })
})

test("a published carousel uses two columns", async ({ page }) => {
  const id = await sembrarCarruselDeEscena("publicado")
  await page.goto(`/guion/${id}`)
  await expect(page.getByText("Publicado en LinkedIn")).toBeVisible()
  await revisarDosColumnas(page, "carrusel publicado", { conLateral: false })
})

test("a failed publication keeps its error on the left and Reintentar with Descartar under the card", async ({
  page,
}) => {
  const id = await sembrarPieza("programado", {
    estado: "error_publicacion",
    estado_antes_del_error: "programado",
    explicacion: "Instagram no aceptó la publicación",
  })
  await page.goto(`/video/${id}`)
  await expect(page.getByText("No se pudo publicar")).toBeVisible()
  const lateral = page.getByTestId("estado-lateral")
  await expect(lateral.getByRole("button", { name: "Reintentar" })).toBeVisible()
  await expect(lateral.getByRole("button", { name: "Descartar esta pieza" })).toBeVisible()
  await revisarDosColumnas(page, "video error de publicación", { conLateral: true })
})
