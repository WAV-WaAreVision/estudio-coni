import { expect, type Page, test } from "@playwright/test"
import { bloquearRedExterna, tocarHastaLlegar } from "./ayudas"
import { type EscenaDeBiblioteca, sembrarBiblioteca } from "./biblioteca-escena"

// Runs only in the `escritorio` project: on a computer the bar sits on top (batch 7).
let escena: EscenaDeBiblioteca

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await bloquearRedExterna(page)
  escena = await sembrarBiblioteca()
})

const barra = (page: Page) => page.getByRole("navigation", { name: "Secciones", exact: true })
const pestana = (page: Page) => barra(page).getByRole("link", { name: "Biblioteca" })

test("on a computer the top bar's «Biblioteca» opens the Biblioteca and stays current inside", async ({ page }) => {
  await page.goto("/")
  await tocarHastaLlegar(page, pestana(page), /\/biblioteca$/)
  await expect(pestana(page)).toHaveAttribute("aria-current", "page")
  const cajaDeLaBarra = await barra(page).boundingBox()
  const cajaDelTitulo = await page.getByRole("heading", { name: "Biblioteca", level: 1 }).boundingBox()
  expect(cajaDeLaBarra).not.toBeNull()
  expect(cajaDelTitulo).not.toBeNull()
  expect(cajaDeLaBarra?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(cajaDelTitulo?.y ?? 0)

  for (const ruta of [
    "/biblioteca/autores",
    "/biblioteca/temas",
    "/biblioteca/semana",
    `/biblioteca/materiales/${escena.listo}`,
  ]) {
    await page.goto(ruta)
    await expect(pestana(page)).toHaveAttribute("aria-current", "page")
  }
})
