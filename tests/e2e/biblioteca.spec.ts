import { expect, test } from "@playwright/test"
import { bloquearRedExterna, disparosDeMateriales, limpiarDisparos } from "./ayudas"
import {
  AUTORA,
  type EscenaDeBiblioteca,
  sembrarBiblioteca,
  TEMA_PRINCIPAL,
  TITULO_ESTRATEGIA,
} from "./biblioteca-escena"

const CLAVE_CON_INTENTO = (materialId: string) => new RegExp(`^procesar-material:${materialId}:[0-9a-f-]{36}$`)

let escena: EscenaDeBiblioteca

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await bloquearRedExterna(page)
  escena = await sembrarBiblioteca()
  limpiarDisparos()
})

test("the phone list shows each material as a card with its words, topic and state, and the bar is unchanged", async ({
  page,
}) => {
  await page.goto("/biblioteca")
  await expect(page.getByRole("heading", { name: "Biblioteca", level: 1 })).toBeVisible()
  await expect(
    page.getByRole("navigation", { name: "Secciones de la Biblioteca" }).getByRole("link", { name: "Materiales" }),
  ).toHaveAttribute("aria-current", "page")

  const lista = page.getByRole("list", { name: "Materiales" })
  await expect(lista.getByRole("listitem")).toHaveCount(5)
  const burnout = lista.getByRole("listitem").filter({ hasText: "Burnout y teletrabajo" })
  await expect(burnout).toContainText(`Documento · ${AUTORA} · Referente`)
  await expect(burnout).toContainText(`${TEMA_PRINCIPAL} +1`)
  await expect(burnout).toContainText("Listo")
  await expect(burnout).toContainText("Hace 2 días")
  await expect(lista.getByRole("listitem").filter({ hasText: "Notas del taller" })).toContainText("Con error")
  await expect(lista.getByRole("listitem").filter({ hasText: "Liderar con IA" })).toContainText("Procesando")
  await expect(lista.getByRole("listitem").filter({ hasText: "síndrome del impostor" })).toContainText("Espera tu OK")

  // The bar's tab still goes to Ingesta in this batch.
  await expect(
    page.getByRole("navigation", { name: "Secciones", exact: true }).getByRole("link", { name: "Biblioteca" }),
  ).toHaveAttribute("href", "/ir-a-biblioteca")
})

test("the quick filters change the list with one tap and live in the URL (4b)", async ({ page }) => {
  await page.goto("/biblioteca")
  const lista = page.getByRole("list", { name: "Materiales" })
  const filtros = page.getByRole("group", { name: "Filtrar por estado" })
  await expect(filtros.getByRole("link", { name: "Todos" })).toHaveAttribute("aria-current", "page")

  await filtros.getByRole("link", { name: "Con error · 1" }).click()
  await expect(page).toHaveURL(/\/biblioteca\?estado=fallido$/)
  await expect(filtros.getByRole("link", { name: "Con error · 1" })).toHaveAttribute("aria-current", "page")
  await expect(filtros.getByRole("link", { name: "Todos" })).not.toHaveAttribute("aria-current", "page")
  await expect(lista.getByRole("listitem")).toHaveCount(1)

  await filtros.getByRole("link", { name: "Procesando · 2" }).click()
  await expect(page).toHaveURL(/\/biblioteca\?estado=procesando$/)
  await expect(lista.getByRole("listitem")).toHaveCount(2)

  // Back undoes a filter: each one is a link.
  await page.goBack()
  await expect(page).toHaveURL(/\/biblioteca\?estado=fallido$/)
  await expect(lista.getByRole("listitem")).toHaveCount(1)

  await filtros.getByRole("link", { name: "Todos" }).click()
  await expect(page).toHaveURL(/\/biblioteca$/)
  await expect(lista.getByRole("listitem")).toHaveCount(5)
})

test("Más filtros folds author, who she is for you and type, and keeps the quick filter", async ({ page }) => {
  await page.goto("/biblioteca?estado=listo")
  await page.getByText("Más filtros", { exact: true }).click()
  await page.getByLabel("¿Quién es para ti?").selectOption({ label: "Estrategia interna" })
  await page.getByRole("button", { name: "Filtrar" }).click()

  // The list writes its params in one order (hrefDeLista), whatever the form sent.
  await expect(page).toHaveURL(/\/biblioteca\?rol=estrategia&estado=listo$/)
  const lista = page.getByRole("list", { name: "Materiales" })
  await expect(lista.getByRole("listitem")).toHaveCount(1)
  await expect(lista).toContainText(TITULO_ESTRATEGIA)
  // With a folded filter on, the chip says how many and comes open.
  await expect(page.getByText("Más filtros · 1", { exact: true })).toBeVisible()

  await page.getByRole("link", { name: "Quitar estos filtros" }).click()
  await expect(page).toHaveURL(/\/biblioteca\?estado=listo$/)
  await expect(lista.getByRole("listitem")).toHaveCount(2)
})

test("Procesar por ~US$ 1,20 on a card starts the run with a key of its own", async ({ page }) => {
  await page.goto("/biblioteca")
  await page.getByRole("button", { name: "Procesar por ~US$ 1,20" }).click()
  await expect(page.getByRole("button", { name: "Procesar por ~US$ 1,20" })).toHaveCount(0, { timeout: 30_000 })
  const disparos = disparosDeMateriales()
  expect(disparos.map((disparo) => disparo.materialId)).toEqual([escena.esperaOk])
  expect(disparos[0]?.clave).toMatch(CLAVE_CON_INTENTO(escena.esperaOk))
})
