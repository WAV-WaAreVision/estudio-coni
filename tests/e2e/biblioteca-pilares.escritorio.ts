import { expect, test } from "@playwright/test"
import { bloquearRedExterna, revisarConAxe } from "./ayudas"
import {
  type EscenaDeAutoresYTemas,
  PILAR,
  PILAR_SECUNDARIO,
  sembrarAutoresYTemas,
  TEMA_PRINCIPAL,
} from "./biblioteca-escena"

// Runs only in the `escritorio` project (1280 x 900).
let escena: EscenaDeAutoresYTemas

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await bloquearRedExterna(page)
  escena = await sembrarAutoresYTemas()
})

test("on the computer, Cambiar pilares gives Instagram a pillar and the list filter finds the topic by it", async ({
  page,
}) => {
  await page.goto(`/biblioteca/temas/${escena.carga}`)
  await page.getByRole("button", { name: "Cambiar pilares" }).click()
  expect(await revisarConAxe(page, "pilares del tema en el computador")).toEqual([])
  await page.getByLabel("Pilar en Instagram").selectOption({ label: "Game Over Impostora" })
  await page.getByRole("checkbox", { name: "Inteligencia emocional" }).check()
  await page.getByRole("button", { name: "Guardar" }).click()
  await expect(page.getByRole("region", { name: "Pilares" }).getByRole("listitem")).toHaveText([
    `LinkedIn: ${PILAR} · También toca: ${PILAR_SECUNDARIO}`,
    "Instagram: Game Over Impostora · También toca: Inteligencia emocional",
  ])

  await page.goto("/biblioteca/temas")
  await page.getByText("Más filtros", { exact: true }).click()
  await page.getByLabel("Pilar", { exact: true }).selectOption({ label: "Game Over Impostora" })
  await page.getByRole("button", { name: "Filtrar" }).click()
  await expect(
    page.getByRole("table", { name: "Temas" }).getByRole("row", { name: new RegExp(TEMA_PRINCIPAL) }),
  ).toBeVisible()
})
