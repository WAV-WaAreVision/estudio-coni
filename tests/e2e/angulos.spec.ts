import { readFileSync } from "node:fs"
import { join } from "node:path"
import { expect, type Page, test } from "@playwright/test"
import { avisarEquilibrioDeAngulos } from "@/lib/avisos/equilibrio"
import { pool } from "../integration/db"
import { clienteDeServicio } from "../integration/servicio"
import { vaciarPiezasEIdeas } from "../integration/siembra"
import {
  bloquearRedExterna,
  capturar,
  configurarServicios,
  conLetraGrande,
  revisarConAxe,
  simularMedios,
} from "./ayudas"
import { sembrarAutoresYTemas, vaciarBiblioteca } from "./biblioteca-escena"
import { avatarYaVisto, conAngulo, sembrarEscena, sembrarPublicadasConAngulo } from "./escena"

// Spec 15d, sections 3 and 4: Coni sees and changes the angle before she signs; Temas and Inicio warn.

const BASE = JSON.parse(readFileSync(join(__dirname, "..", "fixtures", "coni.config.json"), "utf-8"))
const LOOKS = [
  { avatar_id: "look-a", nombre: "Estudio", imagen: "avatares/look-a.png" },
  { avatar_id: "look-b", nombre: "Terraza", imagen: "avatares/look-b.png" },
]

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await bloquearRedExterna(page)
  await pool.query("update public.ajustes set produccion = $1::jsonb", [
    JSON.stringify({ ...BASE, heygen: { ...BASE.heygen, avatares: LOOKS } }),
  ])
  await configurarServicios()
  await simularMedios(page)
  await avatarYaVisto()
})

test.afterAll(async () => {
  await vaciarPiezasEIdeas()
  // The balance notice has no piece: it would stay in Inicio for the specs after this one.
  await pool.query("delete from public.avisos where tipo = 'equilibrio_de_angulo'")
  await vaciarBiblioteca()
})

const campo = (page: Page) => page.getByLabel("Ángulo")

test("Coni ve el ángulo junto al pilar y lo cambia antes de firmar", async ({ page }) => {
  const { guion } = await sembrarEscena()
  await conAngulo(guion, "psicologia-en-la-mesa", "lo-que-construyo")
  await page.goto(`/guion/${guion}`)
  await expect(page.getByText("Psicología en la mesa · Lo que construyo")).toBeVisible()
  await expect(campo(page)).toHaveValue(/[0-9a-f-]{36}/)
  await campo(page).selectOption({ label: "Lo que planteo" })
  await expect(page.getByText("Listo, guardé el ángulo.")).toBeVisible()
  await expect(page.getByText("Psicología en la mesa · Lo que planteo")).toBeVisible()
  expect(await revisarConAxe(page, "gate 1 con ángulo")).toEqual([])
  await page.reload()
  await expect(page.getByText("Psicología en la mesa · Lo que planteo")).toBeVisible()
  await conLetraGrande(page)
  await capturar(page, "guion-angulo-letra-grande", { completa: true })
})

test("Temas marca el ángulo que falta e Inicio lo avisa", async ({ page }) => {
  await vaciarPiezasEIdeas()
  await sembrarAutoresYTemas()
  await sembrarPublicadasConAngulo("psicologia-en-la-mesa", "lo-que-planteo", 6)
  await page.goto("/biblioteca/temas?red=linkedin")
  const pilares = page.getByRole("list", { name: "Pilares de LinkedIn" })
  await expect(pilares.getByRole("link", { name: /Psicología en la mesa/ })).toContainText("Falta Lo que construyo")
  expect(await revisarConAxe(page, "Temas con falta")).toEqual([])

  await pool.query("delete from public.avisos")
  await avisarEquilibrioDeAngulos(clienteDeServicio(), new Date().toISOString(), "America/Santiago")
  await page.goto("/")
  const aviso = page.getByRole("link", {
    name: /ninguna de tus últimas 6 piezas es de «Lo que construyo»/,
  })
  await expect(aviso).toBeVisible()
  await aviso.click()
  await expect(page).toHaveURL(/\/biblioteca\/temas/)
})
