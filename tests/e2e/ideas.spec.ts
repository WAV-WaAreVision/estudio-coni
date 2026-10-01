import { expect, test } from "@playwright/test"
import { pool } from "../integration/db"
import { sembrarIdea, vaciarPiezasEIdeas } from "../integration/siembra"
import { alerta, capturar, configurarServicios, registroDeServicios } from "./ayudas"

const ALERTA = [{ tipo: "verificar dato", texto: "La fuente cita proxémica sin estudio." }]

test.beforeEach(async () => {
  await vaciarPiezasEIdeas()
  await pool.query("delete from vault.secrets where name = 'anthropic'")
  await configurarServicios()
})

test.afterAll(async () => {
  await pool.query("delete from vault.secrets where name = 'anthropic'")
  await pool.query("update public.ajustes set tope_mensual_usd = 40")
})

async function sembrarBanco() {
  await sembrarIdea({
    pilar: "pareja",
    gancho: "Si van a discutir, siéntense del mismo lado.",
    alertas: ALERTA,
    numero: 1,
  })
  await sembrarIdea({ pilar: "deseo", gancho: "El deseo no se apaga: se esconde.", numero: 2 })
  await sembrarIdea({ pilar: "autoestima", gancho: "¿Por qué sientes culpa al descansar?", numero: 3 })
}

test("the bank shows one idea at a time with its pillar, strength and alerts", async ({ page }) => {
  await sembrarBanco()

  await page.goto("/ideas")

  await expect(page.getByRole("heading", { name: "Ideas", level: 1 })).toBeVisible()
  await expect(page.getByText("Idea 1 de 3")).toBeVisible()
  await expect(page.getByRole("heading", { name: "Si van a discutir, siéntense del mismo lado." })).toBeVisible()
  await expect(page.getByText("Pareja y conversación")).toBeVisible()
  await expect(page.getByText("Verificar dato", { exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Usar esta" })).toBeVisible()
  await capturar(page, "ideas-mazo")

  await page.getByRole("button", { name: "Después" }).click()
  await expect(page.getByRole("heading", { name: "El deseo no se apaga: se esconde." })).toBeVisible()
  await expect(page.getByText("Idea 2 de 3")).toBeVisible()
})

test("Usar esta puts the idea first among the week's ideas on Inicio, and Deshacer takes it out", async ({ page }) => {
  await sembrarBanco()
  await page.goto("/ideas")
  await page.getByRole("button", { name: "Después" }).click()

  await page.getByRole("button", { name: "Usar esta" }).click()

  await expect(page.getByText("La sumé a las ideas de la semana.")).toBeVisible()
  await page.goto("/")
  await expect(page.getByRole("checkbox").first()).toHaveAccessibleName(/El deseo no se apaga/)

  await page.goto("/ideas")
  await page.getByRole("button", { name: "Usar esta" }).first().click()
  await page.getByRole("button", { name: "Deshacer" }).click()
  await expect(page.getByRole("heading", { name: /El deseo no se apaga|Si van a discutir/ })).toBeVisible()
  const { rows } = await pool.query("select count(*)::int as n from public.ideas where fijada_en is not null")
  expect(rows[0].n).toBe(1)
})

test("Inicio links to the whole bank", async ({ page }) => {
  await sembrarBanco()

  await page.goto("/")
  await page.getByRole("link", { name: "Ver todas las ideas" }).click()

  await expect(page).toHaveURL(/\/ideas$/)
})

test("search narrows by word and opens the idea she taps", async ({ page }) => {
  await sembrarBanco()
  await page.goto("/ideas")

  await page.getByRole("button", { name: "Buscar" }).click()
  await expect(page.getByText("3 resultados")).toBeVisible()
  await page.getByLabel("Buscar por palabra o tema").fill("culpa")
  await expect(page.getByText("1 resultado")).toBeVisible()
  await capturar(page, "ideas-buscar")

  await page.getByRole("button", { name: /culpa al descansar/ }).click()
  await expect(page.getByRole("heading", { name: "¿Por qué sientes culpa al descansar?" })).toBeVisible()

  await page.getByRole("button", { name: "Buscar" }).click()
  await page.getByLabel("Buscar por palabra o tema").fill("zzz")
  await expect(page.getByText("No encontré ideas con esa palabra.")).toBeVisible()
})

test("she writes an idea of her own, Claude proposes the pillar and alerts, and she confirms them", async ({
  page,
}) => {
  await sembrarBanco()
  await pool.query("select vault.create_secret('sk-ant-de-prueba-de-coni', 'anthropic')")
  await page.goto("/ideas")

  await page.getByRole("button", { name: "Escribir una idea mía" }).click()
  await page.getByLabel("Tu idea").fill("Tu pareja te revisa el celular y lo llama amor.")
  await page.getByRole("button", { name: "Proponer pilar y alertas" }).click()

  await expect(page.getByRole("radio", { name: "Género y límites" })).toBeChecked()
  await expect(page.getByRole("checkbox", { name: /Líneas de ayuda/ })).toBeChecked()
  await capturar(page, "ideas-propia")
  await page.getByRole("checkbox", { name: /Verificar dato/ }).check()
  await page.getByRole("button", { name: "Guardar idea" }).click()

  await expect(page.getByText("Guardé tu idea y la sumé a las ideas de la semana.")).toBeVisible()
  const { rows } = await pool.query(
    "select pilar, alertas, numero, fijada_en from public.ideas where gancho like 'Tu pareja te revisa%'",
  )
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({ pilar: "limites", numero: null })
  expect(rows[0].alertas.map((a: { tipo: string }) => a.tipo)).toEqual(["verificar dato", "líneas de ayuda"])
  expect(rows[0].fijada_en).not.toBeNull()
  const llamadas = await registroDeServicios()
  expect(llamadas.filter((l) => l.ruta === "/v1/messages")).toHaveLength(1)
})

test("without her Anthropic key the proposal explains it and she can still choose the pillar", async ({ page }) => {
  await sembrarBanco()
  await page.goto("/ideas")

  await page.getByRole("button", { name: "Escribir una idea mía" }).click()
  await page.getByLabel("Tu idea").fill("Tu pareja te revisa el celular y lo llama amor.")
  await page.getByRole("button", { name: "Proponer pilar y alertas" }).click()

  await expect(alerta(page, "necesito tu llave de Anthropic")).toBeVisible()
  await page.getByRole("button", { name: "Elegir yo el pilar" }).click()
  await page.getByRole("radio", { name: "Bienestar emocional" }).check()
  await page.getByRole("button", { name: "Guardar idea" }).click()

  await expect(page.getByText("Guardé tu idea y la sumé a las ideas de la semana.")).toBeVisible()
  expect((await registroDeServicios()).filter((l) => l.ruta === "/v1/messages")).toEqual([])
})
