import { expect, type Page, test } from "@playwright/test"
import { bloquearRedExterna, tocarHastaLlegar } from "./ayudas"
import { type EscenaDeBiblioteca, sembrarBiblioteca } from "./biblioteca-escena"

// Batch 7: the bar's «Biblioteca» opens the app's own Biblioteca and stays current inside it.
let escena: EscenaDeBiblioteca

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await bloquearRedExterna(page)
  escena = await sembrarBiblioteca()
})

const barra = (page: Page) => page.getByRole("navigation", { name: "Secciones", exact: true })
const pestana = (page: Page) => barra(page).getByRole("link", { name: "Biblioteca" })

test("tapping «Biblioteca» lands on the Biblioteca with the tab current, and it stays current inside", async ({
  page,
}) => {
  await page.goto("/")
  await expect(pestana(page)).not.toHaveAttribute("aria-current")
  await tocarHastaLlegar(page, pestana(page), /\/biblioteca$/)
  await expect(page.getByRole("heading", { name: "Biblioteca", level: 1 })).toBeVisible()
  await expect(pestana(page)).toHaveAttribute("aria-current", "page")

  for (const ruta of [
    "/biblioteca/autores",
    "/biblioteca/temas",
    "/biblioteca/semana",
    `/biblioteca/materiales/${escena.listo}`,
  ]) {
    await page.goto(ruta)
    await expect(pestana(page)).toHaveAttribute("aria-current", "page")
    await expect(barra(page).getByRole("link", { name: "Inicio" })).not.toHaveAttribute("aria-current")
  }
})

test("an old /ir-a-biblioteca link lands on the Biblioteca", async ({ page }) => {
  await page.goto("/ir-a-biblioteca")
  await expect(page).toHaveURL(/\/biblioteca$/)
  await expect(page.getByRole("heading", { name: "Biblioteca", level: 1 })).toBeVisible()
  await expect(pestana(page)).toHaveAttribute("aria-current", "page")
})
