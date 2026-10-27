import { expect, test } from "@playwright/test"
import { leerFila, vaciarPiezasEIdeas } from "../integration/siembra"
import { bloquearRedExterna, configurarServicios, limpiarDisparos } from "./ayudas"
import { PIEZAS, sembrarCarruselDeEscena, sembrarPiezaDeEscena } from "./escena"

test.beforeEach(async ({ page }) => {
  await bloquearRedExterna(page)
  await vaciarPiezasEIdeas()
  limpiarDisparos()
  await configurarServicios()
})

test("a reel at gate 1 is discarded after the question, and leaves Inicio", async ({ page }) => {
  const id = await sembrarPiezaDeEscena("guion_por_aprobar", PIEZAS.guion)
  await page.goto(`/guion/${id}`)
  await page.getByRole("button", { name: "Descartar esta pieza" }).click()
  await expect(page.getByText("¿Descartar esta pieza? No se puede deshacer.")).toBeVisible()
  await page.getByRole("button", { name: "Sí, descartar" }).click()

  await expect.poll(async () => (await leerFila(id)).estado).toBe("descartado")
  await page.goto("/")
  await expect(page.getByText(PIEZAS.guion.titulo)).toHaveCount(0)
})

test("a carousel at gate 1 can be discarded, and Cancelar keeps it", async ({ page }) => {
  const id = await sembrarCarruselDeEscena("guion_por_aprobar")
  await page.goto(`/guion/${id}`)
  await page.getByRole("button", { name: "Descartar esta pieza" }).click()
  await page.getByRole("button", { name: "Cancelar" }).click()
  expect((await leerFila(id)).estado).toBe("guion_por_aprobar")

  await page.getByRole("button", { name: "Descartar esta pieza" }).click()
  await page.getByRole("button", { name: "Sí, descartar" }).click()
  await expect.poll(async () => (await leerFila(id)).estado).toBe("descartado")
})
