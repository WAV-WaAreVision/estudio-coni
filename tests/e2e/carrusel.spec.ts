import { expect, test } from "@playwright/test"
import { LAMINAS_DE_PRUEBA } from "../fixtures/carrusel"
import { vaciarPiezasEIdeas } from "../integration/siembra"
import { bloquearRedExterna, configurarServicios, limpiarDisparos } from "./ayudas"
import { CARRUSEL, sembrarCarruselDeEscena } from "./escena"

test.beforeEach(async ({ page }) => {
  await bloquearRedExterna(page)
  await vaciarPiezasEIdeas()
  limpiarDisparos()
  await configurarServicios()
})

test("a carousel being written says so and refreshes itself", async ({ page }) => {
  const id = await sembrarCarruselDeEscena("guion_en_proceso")
  await page.goto(`/guion/${id}`)
  await expect(page.getByRole("heading", { name: CARRUSEL.titulo, level: 1 })).toBeVisible()
  await expect(page.getByText("Estoy escribiendo el carrusel")).toBeVisible()
})

test("gate 1 of a carousel shows its numbered slides and post, with no voice or avatar step", async ({ page }) => {
  const id = await sembrarCarruselDeEscena("guion_por_aprobar")
  await page.goto(`/guion/${id}`)
  await expect(page.getByText("Carrusel de LinkedIn · 6 láminas")).toBeVisible()
  await expect(page.getByText("Lámina 1 · Portada")).toBeVisible()
  await expect(page.getByText(LAMINAS_DE_PRUEBA[5]?.texto ?? "")).toBeVisible()
  await expect(page.getByRole("heading", { name: "2. Revisa el texto de la publicación" })).toBeVisible()
  await expect(page.getByText("Elige tu avatar")).toHaveCount(0)
  await expect(page.getByText("Preparar mi voz")).toHaveCount(0)
  await expect(page.getByRole("slider", { name: "Desliza para firmar" })).toHaveAttribute("aria-disabled", "false")
})

test("a signed carousel waits, read only, and says what comes next", async ({ page }) => {
  const id = await sembrarCarruselDeEscena("armando_carrusel")
  await page.goto(`/guion/${id}`)
  await expect(page.getByText("Firmaste el texto del carrusel")).toBeVisible()
  await expect(page.getByText(/El diseño de las láminas llega en la próxima versión de la app/)).toBeVisible()
  await expect(page.getByRole("heading", { name: "Así quedó firmado" })).toBeVisible()
  await expect(page.getByRole("slider")).toHaveCount(0)
})
