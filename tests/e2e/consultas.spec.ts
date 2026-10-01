import { expect, test } from "@playwright/test"
import { pool } from "../integration/db"

test.beforeEach(async () => {
  await pool.query("delete from public.consultas")
})

test.afterAll(async () => {
  await pool.query("delete from public.consultas")
})

test("Coni notes a consultation with one tap, sees the month's total and can take it back", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByText("Todavía ninguna en", { exact: false })).toBeVisible()

  await page.getByRole("button", { name: "Llegó una consulta" }).click()

  await expect(page.getByText(/^1 consulta en /)).toBeVisible()
  await expect(page.getByText(/^Anotada\. Van 1 en /)).toBeVisible()
  expect((await pool.query("select count(*)::int as n from public.consultas")).rows[0]).toEqual({ n: 1 })

  // The total survives a reload: it comes from the database, not from the page.
  await page.reload()
  await expect(page.getByText(/^1 consulta en /)).toBeVisible()

  await page.getByRole("button", { name: "Llegó una consulta" }).click()
  await expect(page.getByText(/^2 consultas en /)).toBeVisible()
  await page.getByRole("button", { name: "Deshacer" }).click()
  await expect(page.getByText(/^1 consulta en /)).toBeVisible()
  expect((await pool.query("select count(*)::int as n from public.consultas")).rows[0]).toEqual({ n: 1 })
})
