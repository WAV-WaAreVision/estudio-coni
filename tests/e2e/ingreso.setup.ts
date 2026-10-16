import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { expect, test as setup } from "@playwright/test"
import { alerta, capturar, leerCodigo, vaciarBuzon } from "./ayudas"
import { CORREO_DE_CONI, ESTADO_DE_SESION } from "./entorno"

setup("Coni entra con el código que le llega al correo", async ({ page }) => {
  await vaciarBuzon()

  await page.goto("/")
  await expect(page).toHaveURL(/\/ingreso$/)
  await expect(page.getByRole("img", { name: "Conidolly" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Hola, Coni" })).toBeVisible()
  await expect(page.getByText("c•••@estudio.test")).toBeVisible()
  await capturar(page, "01-ingreso")

  await page.getByRole("button", { name: "Mandarme el código" }).click()
  await expect(page.getByRole("heading", { name: "Entra con el código que te mandé" })).toBeVisible()
  const primera = page.getByRole("textbox", { name: "Número 1 de 6" })
  await expect(primera).toHaveAttribute("autocomplete", "one-time-code")

  // A wrong code says so, empties the boxes and lets her try again.
  await primera.click()
  await page.keyboard.type("000000")
  await expect(alerta(page, "Ese código no sirve o ya venció. Pide otro.")).toBeVisible()
  // The error is said once, and asking for another code is a raised secondary.
  await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(1)
  await expect(page.getByRole("button", { name: "Mandar otro código" })).toHaveClass(
    /\bbg-piedra\b.*\bshadow-relieve\b/,
  )
  await capturar(page, "02-ingreso-codigo")

  const codigo = await leerCodigo(CORREO_DE_CONI)
  await page.getByRole("textbox", { name: "Número 1 de 6" }).click()
  await page.keyboard.type(codigo)
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByText("Hola, Coni", { exact: true })).toBeVisible()

  mkdirSync(dirname(ESTADO_DE_SESION), { recursive: true })
  await page.context().storageState({ path: ESTADO_DE_SESION })
})
