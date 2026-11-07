import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { expect, type Page, test } from "@playwright/test"
import { bloquearRedExterna, disparosDelMotor, limpiarDisparos, revisarConAxe } from "./ayudas"
import { sembrarSemana, TEORIA_PRINCIPAL } from "./biblioteca-escena"
import { cajaDe, sobraDeAncho } from "./medidas-de-escritorio"

// Runs only in the `escritorio` project (1280 x 900).
const PEDIDO = "El motor se puso a trabajar. Las ideas llegan a Ideas en unos minutos."

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await bloquearRedExterna(page)
  limpiarDisparos()
})

test("the run, Proponer ahora and what to upload sit in a sticky right panel; what the engine crossed takes the rest", async ({
  page,
}) => {
  await sembrarSemana({ estado: "lista" })
  await page.goto("/biblioteca/semana")
  const panel = page.getByRole("complementary", { name: "Corrida del motor" })
  await expect(panel).toHaveCSS("position", "sticky")
  await expect(panel.getByRole("button", { name: "Proponer ahora" })).toBeVisible()
  await expect(panel.getByText("Cuesta cerca de US$ 0,23")).toBeVisible()
  await expect(panel.getByRole("region", { name: "Qué subir después" })).toBeVisible()
  await expect(page.getByRole("region", { name: "Qué subir después" })).toHaveCount(1)

  const cruzado = page.getByRole("region", { name: "Lo que el motor cruzó esta semana" })
  await expect(cruzado.getByRole("heading", { name: TEORIA_PRINCIPAL, level: 3 })).toBeVisible()
  const titulo = page.getByRole("heading", { name: "Biblioteca", level: 1 })
  const [izquierda, derecha, arriba] = await Promise.all([cajaDe(cruzado), cajaDe(panel), cajaDe(titulo)])
  expect(izquierda.right).toBeLessThanOrEqual(derecha.left)
  expect(izquierda.width).toBeGreaterThanOrEqual(600)
  expect(Math.abs(derecha.top - arriba.top)).toBeLessThanOrEqual(8)
  expect(await sobraDeAncho(page)).toBeLessThanOrEqual(0)
  expect(await revisarConAxe(page, "semana en el computador")).toEqual([])
})

test("on a computer the sections are tabs with Semana open, and the phone's section menu is not drawn", async ({
  page,
}) => {
  await sembrarSemana({ estado: "lista" })
  await page.goto("/biblioteca/semana")
  const secciones = page.getByRole("navigation", { name: "Secciones de la Biblioteca" })
  await expect(secciones).toHaveCount(1)
  await expect(secciones.getByRole("link", { name: "Semana" })).toHaveAttribute("aria-current", "page")
  await expect(page.getByRole("button", { name: /^Sección de la Biblioteca: / })).toHaveCount(0)
})

test("a failed week is asked again from the panel", async ({ page }) => {
  const escena = await sembrarSemana({ estado: "fallida" })
  await page.goto("/biblioteca/semana")
  const panel = page.getByRole("complementary", { name: "Corrida del motor" })
  await panel.getByRole("button", { name: "Proponer ahora" }).click()
  await expect(panel.getByRole("status").filter({ hasText: PEDIDO })).toBeVisible()
  // A retry is keyed by the failed run it replaces too (motor:<semana>:<creada_en>), so Trigger never swallows it.
  expect(disparosDelMotor()).toEqual([
    {
      tarea: "motor-manual",
      semana: escena.semana,
      clave: expect.stringMatching(new RegExp(`^motor:${escena.semana}:.+`)),
    },
  ])
})

async function capturaDeEscritorio(page: Page, nombre: string): Promise<void> {
  await page.waitForLoadState("networkidle")
  await page.evaluate(() => document.fonts.ready)
  const carpeta = process.env.VISUAL_FINALES
  if (carpeta) {
    mkdirSync(carpeta, { recursive: true })
    await page.screenshot({ path: join(carpeta, nombre), fullPage: true })
    return
  }
  // The week and the cost change with the calendar: masked, as the phone's visual spec does.
  await expect(page).toHaveScreenshot(nombre, { fullPage: true, mask: [page.locator('[data-snapshot="varia"]')] })
}

test("visual: Semana on a computer", async ({ page }) => {
  await sembrarSemana({ estado: "lista" })
  await page.goto("/biblioteca/semana")
  await expect(page.getByRole("region", { name: "Lo que el motor cruzó esta semana" })).toBeVisible()
  await capturaDeEscritorio(page, "biblioteca-semana-escritorio.png")
})
