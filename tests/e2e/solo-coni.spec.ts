import { expect, test } from "@playwright/test"
import { sembrarPieza, vaciarPiezasEIdeas } from "../integration/siembra"
import { entrarComo } from "./ayudas"
import { CORREO_DEL_MANTENEDOR } from "./entorno"

test("anyone else who signs in, the maintainer included, only sees that the app is Coni's", async ({ browser }) => {
  await vaciarPiezasEIdeas()
  const id = await sembrarPieza("guion_por_aprobar", { titulo: "Un guion de Coni" })
  const contexto = await browser.newContext()
  await entrarComo(contexto, CORREO_DEL_MANTENEDOR)
  const page = await contexto.newPage()

  await page.goto("/")
  await expect(page.getByRole("heading", { name: "Esta app es solo para Coni." })).toBeVisible()
  await expect(page.getByText("Un guion de Coni")).toHaveCount(0)
  await expect(page.getByRole("navigation")).toHaveCount(0)

  await page.goto(`/guion/${id}`)
  await expect(page.getByRole("heading", { name: "Esta app es solo para Coni." })).toBeVisible()
  await expect(page.getByText("Un guion de Coni")).toHaveCount(0)

  await page.goto("/ajustes")
  await expect(page.getByRole("heading", { name: "Esta app es solo para Coni." })).toBeVisible()
  await page.goto("/ideas")
  await expect(page.getByRole("heading", { name: "Esta app es solo para Coni." })).toBeVisible()

  await contexto.close()
})

test("without a session every screen sends her to sign in", async ({ browser }) => {
  // The project signs Coni in by default; this one arrives with nothing.
  const contexto = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await contexto.newPage()

  for (const ruta of ["/guion/00000000-0000-4000-8000-000000000000", "/metricas", "/calendario"]) {
    await page.goto(ruta)
    await expect(page).toHaveURL(/\/ingreso$/)
  }
  await contexto.close()
})
