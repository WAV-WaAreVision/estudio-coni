import { expect, test } from "@playwright/test"
import { pool } from "../integration/db"
import { alerta, capturar } from "./ayudas"

const CONI = "c0000000-0000-4000-8000-000000000001"

async function limpiar() {
  await pool.query(
    "update public.ajustes set tope_mensual_usd = 40, limite_duro_usd = null, motor_semanal_activo = true, fusiones_nocturnas_activas = true",
  )
  await pool.query("delete from public.gastos")
  await pool.query("delete from public.limites_del_mes")
  await pool.query("delete from public.avisos where clave like 'limite_alcanzado:%'")
}

async function gastado(usd: number) {
  await pool.query(
    "insert into public.gastos (proveedor, paso, mes, estimado_usd, real_usd, estado, clave) values ('heygen', 'e2e', date_trunc('month', now() at time zone 'America/Santiago')::date, $1, $1, 'confirmado', 'e2e-presupuesto-gasto')",
    [usd],
  )
}

async function ajustes() {
  const { rows } = await pool.query("select * from public.ajustes")
  return rows[0]
}

test.beforeEach(limpiar)
test.afterAll(limpiar)

test("Coni opens her budget from Ajustes and moves her cap and her limit, logged with her as the actor", async ({
  page,
}) => {
  // `eventos` is append-only, so earlier runs stay: only what this test writes is looked at.
  const { rows: previos } = await pool.query("select coalesce(max(id), 0) as id from public.eventos")
  await gastado(12.8)
  await page.goto("/ajustes")
  await page.getByRole("link", { name: "Presupuesto · US$ 12 de 40" }).click()

  await expect(page.getByRole("heading", { name: "Presupuesto", level: 1 })).toBeVisible()
  await expect(page.getByText("Llevas US$ 12,80 de tu tope de US$ 40,00 este mes")).toBeVisible()
  await expect(page.getByText("US$ 80 (el doble del tope)")).toBeVisible()

  await page.getByRole("button", { name: "Subir el tope" }).click()
  await page.getByRole("button", { name: "Subir el tope" }).click()
  await expect(page.getByText("US$ 100 (el doble del tope)")).toBeVisible()
  await expect.poll(async () => Number((await ajustes()).tope_mensual_usd)).toBe(50)
  const { rows } = await pool.query(
    "select actor_usuario from public.eventos where id > $1 and tabla = 'ajustes' and datos ->> 'tope_mensual_usd' = '50.00'",
    [previos[0].id],
  )
  expect(rows.map((r) => r.actor_usuario)).toEqual([CONI])

  await page.getByRole("button", { name: "Bajar el límite" }).click()
  await expect(page.getByText("US$ 95", { exact: true })).toBeVisible()
  await expect.poll(async () => Number((await ajustes()).limite_duro_usd)).toBe(95)
  await capturar(page, "presupuesto")
})

test("at the limit she reactivates the month with one confirmation, and a short limit is explained", async ({
  page,
}) => {
  await gastado(80)
  await page.goto("/ajustes/presupuesto")

  await expect(page.getByText("Pasaste tu tope. La app sigue hasta tu límite de US$ 80,00.")).toBeVisible()
  await expect(
    page.getByText("Llegaste a tu límite de US$ 80,00. Lo nuevo quedó en pausa; lo que ya firmaste sigue."),
  ).toBeVisible()

  await page.getByRole("button", { name: "Reactivar" }).click()
  const campo = page.getByLabel("Tu límite de este mes")
  await expect(campo).toHaveValue("120")
  await campo.fill("70")
  await page.getByRole("button", { name: "Confirmar" }).click()
  await expect(alerta(page, "Ese límite no alcanza: ya gastaste US$ 80,00 este mes. Elige uno mayor.")).toBeVisible()
  await expect(campo).toHaveValue("70")

  await campo.fill("120")
  await page.getByRole("button", { name: "Confirmar" }).click()
  await expect(page.getByText("Listo: tu límite de este mes es US$ 120,00.")).toBeVisible()
  await expect(page.getByRole("button", { name: "Reactivar" })).toHaveCount(0)
  const { rows } = await pool.query("select limite_usd::float8 as limite from public.limites_del_mes")
  expect(rows).toEqual([{ limite: 120 }])

  await page.reload()
  await expect(page.getByText("Este mes tu límite es US$ 120,00 porque lo reactivaste.")).toBeVisible()
  await capturar(page, "presupuesto-reactivado")
})

test("she switches off the Sunday ideas and the nightly merges", async ({ page }) => {
  await page.goto("/ajustes/presupuesto")

  await page.getByRole("switch", { name: "Ideas nuevas cada domingo" }).click()
  await expect.poll(async () => (await ajustes()).motor_semanal_activo).toBe(false)
  await page.getByRole("switch", { name: "Unir temas parecidos cada noche" }).click()
  await expect.poll(async () => (await ajustes()).fusiones_nocturnas_activas).toBe(false)

  await page.reload()
  await expect(page.getByRole("switch", { name: "Ideas nuevas cada domingo" })).toHaveAttribute("aria-checked", "false")
})

test("a cap that leaves the limit under what was spent is saved with a warning", async ({ page }) => {
  await gastado(22)
  await page.goto("/ajustes/presupuesto")

  for (let i = 0; i < 6; i++) await page.getByRole("button", { name: "Bajar el tope" }).click()

  await expect(
    page.getByText(
      "Ya gastaste US$ 22,00; con este límite lo nuevo queda en pausa hasta el próximo mes. Lo que ya firmaste sigue.",
    ),
  ).toBeVisible()
  await expect.poll(async () => Number((await ajustes()).tope_mensual_usd)).toBe(10)
})
