import { expect, type Page, test } from "@playwright/test"
import { bloquearRedExterna, conLetraGrande, revisarConAxe, tocarHastaLlegar } from "./ayudas"
import {
  type EscenaDeAutoresYTemas,
  PILAR,
  PILAR_SECUNDARIO,
  sembrarAutoresYTemas,
  TEMA_PRINCIPAL,
} from "./biblioteca-escena"

let escena: EscenaDeAutoresYTemas

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await bloquearRedExterna(page)
  escena = await sembrarAutoresYTemas()
})

async function filtrarPorPilar(page: Page, nombre: string) {
  await page.goto("/biblioteca/temas?red=linkedin")
  await tocarHastaLlegar(
    page,
    page.getByRole("list", { name: "Pilares de LinkedIn" }).getByRole("link", { name: nombre, exact: true }),
    /\?red=linkedin&pilar=[0-9a-f-]{36}(?:&v=\d+)?$/,
  )
}

test("a topic's page says its pillars per network, with «También toca» and never «principal»", async ({ page }) => {
  await page.goto(`/biblioteca/temas/${escena.carga}`)
  const pilares = page.getByRole("region", { name: "Pilares" })
  await expect(pilares.getByRole("listitem")).toHaveText([
    `LinkedIn: ${PILAR} · También toca: ${PILAR_SECUNDARIO}`,
    "Sin pilar en Instagram",
  ])
  await expect(pilares).not.toContainText("rincipal")
})

test("Cambiar pilares changes the pillar and a secondary, and the Temas filter follows the new pillar", async ({
  page,
}) => {
  await page.goto(`/biblioteca/temas/${escena.carga}`)
  await page.getByRole("button", { name: "Cambiar pilares" }).click()
  await expect(page.getByLabel("Pilar en LinkedIn")).toBeFocused()
  await page.getByLabel("Pilar en LinkedIn").selectOption({ label: "Psicología en la mesa" })
  await page.getByRole("checkbox", { name: "Mujeres líderes" }).check()
  await page.getByLabel("Pilar en Instagram").selectOption({ label: "Mi nueva partida" })
  await page.getByRole("switch", { name: "Capa TDAH" }).click()
  await page.getByRole("button", { name: "Guardar" }).click()

  const pilares = page.getByRole("region", { name: "Pilares" })
  await expect(pilares.getByRole("listitem")).toHaveText([
    `LinkedIn: Psicología en la mesa · También toca: ${PILAR_SECUNDARIO}, Mujeres líderes`,
    "Instagram: Mi nueva partida · Capa TDAH",
  ])
  await expect(page.getByRole("button", { name: "Cambiar pilares" })).toBeFocused()

  await filtrarPorPilar(page, "Psicología en la mesa")
  const tarjetas = page.getByRole("list", { name: "Temas" }).getByRole("listitem")
  await expect(tarjetas).toHaveCount(1)
  await expect(tarjetas.nth(0)).toContainText(TEMA_PRINCIPAL)

  await filtrarPorPilar(page, PILAR)
  await expect(page.getByText("Ningún tema coincide con esos filtros.")).toBeVisible()
})

test("the Pilares section and its form pass WCAG 2.x AA and hold at large text", async ({ page }) => {
  await page.goto(`/biblioteca/temas/${escena.carga}`)
  await page.getByRole("button", { name: "Cambiar pilares" }).click()
  await expect(page.getByLabel("Pilar en LinkedIn")).toBeVisible()
  expect(await revisarConAxe(page, "pilares del tema")).toEqual([])
  await conLetraGrande(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(
    true,
  )
  for (const nombre of ["Guardar", "Cancelar"]) {
    const caja = await page.getByRole("button", { name: nombre }).boundingBox()
    expect(caja?.height ?? 0, nombre).toBeGreaterThanOrEqual(44)
  }
})
