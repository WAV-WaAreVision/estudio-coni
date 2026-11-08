import { readFileSync } from "node:fs"
import { join } from "node:path"
import { expect, test } from "@playwright/test"
import { pool } from "../integration/db"
import { ajustarPieza, sembrarPieza, vaciarPiezasEIdeas } from "../integration/siembra"
import {
  bloquearRedExterna,
  capturar,
  configurarServicios,
  GUION_VALIDO,
  revisarConAxe,
  simularMedios,
  TEXTO_VALIDO,
} from "./ayudas"
import { sembrarBiblioteca, TITULO_ESTRATEGIA, vaciarBiblioteca } from "./biblioteca-escena"
import { avatarYaVisto } from "./escena"
import { cajaDe, firmaDe, sobraDeAncho } from "./medidas-de-escritorio"

// «Avisar a Federico» on a computer, 1280 x 900 (spec 2026-11-07, A11). Measured and captured, no baselines: the
// button stays where the failure is said, inside the screen's columns, never a floating panel.
const BASE = JSON.parse(readFileSync(join(__dirname, "..", "fixtures", "coni.config.json"), "utf-8"))
const LOOKS = [{ avatar_id: "look-a", nombre: "Estudio", imagen: "avatares/look-a.png" }]
const CONFIG = { ...BASE, heygen: { ...BASE.heygen, avatares: LOOKS } }
const LLAVE = "No pude preparar tu voz. ElevenLabs respondió HTTP 401: Invalid API key"
const AVISAR = "Avisar a Federico"

/** The balances are read with these keys, against the fake services (issue 101's balance blocks). */
async function conLlavesDeSaldo(): Promise<void> {
  for (const nombre of ["heygen", "elevenlabs"]) {
    await pool.query("delete from vault.secrets where name = $1", [nombre])
    await pool.query("select vault.create_secret($1, $2)", [`llave-de-${nombre}-e2e`, nombre])
  }
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await bloquearRedExterna(page)
  await vaciarPiezasEIdeas()
  await pool.query("delete from public.avisos_a_federico")
  await pool.query("update public.ajustes set produccion = $1::jsonb", [JSON.stringify(CONFIG)])
  await configurarServicios()
  await simularMedios(page)
  await avatarYaVisto()
})

test.afterAll(async () => {
  await pool.query("delete from vault.secrets where name in ('heygen', 'elevenlabs')")
  await pool.query("delete from public.avisos_a_federico")
  await pool.query("update public.ajustes set produccion = '{}'::jsonb")
  await vaciarBiblioteca()
  await vaciarPiezasEIdeas()
})

test("gate 1 keeps its two columns with the button inside «1. Escucha tu voz»", async ({ page }) => {
  const id = await sembrarPieza("guion_por_aprobar", { guion: GUION_VALIDO, texto: TEXTO_VALIDO })
  await ajustarPieza(id, { audio_id: null, explicacion: LLAVE })
  await page.goto(`/guion/${id}`)

  const voz = page.getByRole("region", { name: "1. Escucha tu voz" })
  const boton = voz.getByRole("button", { name: AVISAR })
  await expect(boton).toBeVisible()
  const lectura = await cajaDe(page.locator("section[aria-labelledby=guion]"))
  expect((await cajaDe(firmaDe(page))).left).toBeGreaterThanOrEqual(lectura.right)
  expect((await cajaDe(boton)).left).toBeGreaterThanOrEqual(lectura.right)
  expect((await cajaDe(boton)).height).toBeGreaterThanOrEqual(44)
  expect(await sobraDeAncho(page)).toBeLessThanOrEqual(0)
  expect(await revisarConAxe(page, "avisar voz en computador")).toEqual([])
  await capturar(page, "avisar-voz-escritorio", { completa: true })

  await boton.click()
  await expect(voz.getByText("Le avisé a Federico.")).toBeVisible()
  await capturar(page, "avisar-voz-avisado-escritorio", { completa: true })
})

test("a stopped video uses two columns: what happened on the left, the piece's card on the right", async ({ page }) => {
  const id = await sembrarPieza("en_render", { explicacion: "HeyGen respondió HTTP 400: avatar_not_found" })
  await page.goto(`/guion/${id}`)

  const bloque = page.getByRole("alert").filter({ hasText: "El video está detenido" })
  await expect(bloque.getByRole("button", { name: AVISAR })).toBeVisible()
  const principal = await cajaDe(page.getByTestId("estado-principal"))
  const pieza = await cajaDe(page.getByTestId("estado-pieza"))
  expect(pieza.left).toBeGreaterThanOrEqual(principal.right)
  expect(Math.abs(pieza.top - principal.top)).toBeLessThanOrEqual(1)
  expect(principal.width).toBeGreaterThan(pieza.width)
  // Wider than the phone's 520 px column: the screen uses the computer's width.
  expect(principal.width + pieza.width).toBeGreaterThan(560)
  const volver = await cajaDe(page.getByRole("link", { name: "Volver a Inicio" }))
  expect(volver.right).toBeLessThanOrEqual(principal.right)
  expect(await sobraDeAncho(page)).toBeLessThanOrEqual(0)
  expect(await revisarConAxe(page, "avisar video en computador")).toEqual([])
  await capturar(page, "avisar-video-escritorio", { completa: true })
})

test("a material whose card cannot be read has the button in its reading column and in the Biblioteca panel", async ({
  page,
}) => {
  const { estrategia } = await sembrarBiblioteca()
  await pool.query("update public.fichas set citas = '\"rota\"'::jsonb where material_id = $1", [estrategia])

  await page.goto(`/biblioteca/materiales/${estrategia}`)
  const principal = page.locator("[data-detalle=principal]")
  await expect(principal.getByText("No pude leer la ficha de este material.")).toBeVisible()
  await expect(principal.getByRole("button", { name: AVISAR })).toBeVisible()
  await expect(page.getByRole("complementary", { name: "Acciones del material" }).getByText(AVISAR)).toHaveCount(0)
  expect(await sobraDeAncho(page)).toBeLessThanOrEqual(0)
  expect(await revisarConAxe(page, "avisar material en computador")).toEqual([])
  await capturar(page, "avisar-material-escritorio", { completa: true })

  await page.goto(`/biblioteca?m=${estrategia}`)
  const panel = page.getByRole("region", { name: TITULO_ESTRATEGIA })
  await expect(panel.getByText("No pude leer la ficha de este material.")).toBeVisible()
  await expect(panel.getByText("Este material no dejó ideas.")).toHaveCount(0)
  await panel.getByRole("button", { name: AVISAR }).click()
  await expect(panel.getByText("Le avisé a Federico.")).toBeVisible()
  expect(await sobraDeAncho(page)).toBeLessThanOrEqual(0)
  await capturar(page, "avisar-material-panel-escritorio", { completa: true })
})

test("a HeyGen balance that does not cover the signature has the button in the block at the top", async ({ page }) => {
  await configurarServicios({ heygenSaldo: 0 })
  await conLlavesDeSaldo()
  const id = await sembrarPieza("guion_por_aprobar", { guion: GUION_VALIDO, texto: TEXTO_VALIDO })
  await ajustarPieza(id, { audio_id: null })
  await page.goto(`/guion/${id}`)

  const arriba = page.getByTestId("bloqueo-de-firma")
  const boton = arriba.getByRole("button", { name: AVISAR })
  await expect(boton).toBeVisible()
  const lectura = await cajaDe(page.locator("section[aria-labelledby=guion]"))
  expect((await cajaDe(boton)).left).toBeGreaterThanOrEqual(lectura.right)
  expect((await cajaDe(boton)).height).toBeGreaterThanOrEqual(44)
  expect(await sobraDeAncho(page)).toBeLessThanOrEqual(0)
  expect(await revisarConAxe(page, "avisar saldo en computador")).toEqual([])
  await capturar(page, "avisar-saldo-video-escritorio", { completa: true })

  await boton.click()
  await expect(arriba.getByText("Le avisé a Federico.")).toBeVisible()
})
