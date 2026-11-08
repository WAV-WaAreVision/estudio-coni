import { readFileSync } from "node:fs"
import { join } from "node:path"
import { expect, type Page, test } from "@playwright/test"
import { pool } from "../integration/db"
import { ajustarPieza, sembrarPieza, vaciarPiezasEIdeas } from "../integration/siembra"
import { capturar, configurarServicios, GUION_VALIDO, registroDeServicios, simularMedios, TEXTO_VALIDO } from "./ayudas"
import { sembrarBiblioteca, TITULO_ESTRATEGIA, vaciarBiblioteca } from "./biblioteca-escena"

// «Avisar a Federico» on the phone (spec 2026-11-07, decision 6 and amendment A11): the button where a failure only WAV
// can fix is shown, one email to WAV however many taps, and «Le avisé a Federico.» once it went out.
const BASE = JSON.parse(readFileSync(join(__dirname, "..", "fixtures", "coni.config.json"), "utf-8"))
const LLAVE = "No pude preparar tu voz. ElevenLabs respondió HTTP 401: Invalid API key"
const DETENIDO = "HeyGen respondió HTTP 400: avatar_not_found"
const TITULO = "El deseo no se apaga, se esconde"
const AVISAR = "Avisar a Federico"

/** The balances are read with these keys, against the fake services (issue 101's balance blocks). */
async function conLlavesDeSaldo(): Promise<void> {
  for (const nombre of ["heygen", "elevenlabs"]) {
    await pool.query("delete from vault.secrets where name = $1", [nombre])
    await pool.query("select vault.create_secret($1, $2)", [`llave-de-${nombre}-e2e`, nombre])
  }
}
const LE_AVISE = "Le avisé a Federico."

async function correosAWav(): Promise<{ subject: string; to: string[] }[]> {
  return (await registroDeServicios())
    .filter((pedido) => pedido.ruta === "/emails")
    .map((pedido) => JSON.parse(pedido.cuerpo) as { subject: string; to: string[] })
}

async function vozConLlaveRechazada(): Promise<string> {
  const id = await sembrarPieza("guion_por_aprobar", { guion: GUION_VALIDO, texto: TEXTO_VALIDO })
  await ajustarPieza(id, { audio_id: null, explicacion: LLAVE, titulo: TITULO })
  return id
}

async function fichaIlegible(): Promise<string> {
  const { estrategia } = await sembrarBiblioteca()
  await pool.query("update public.fichas set citas = '\"rota\"'::jsonb where material_id = $1", [estrategia])
  return estrategia
}

const voz = (page: Page) => page.getByRole("region", { name: "1. Escucha tu voz" })

test.beforeEach(async ({ page }) => {
  await vaciarPiezasEIdeas()
  await pool.query("delete from public.avisos_a_federico")
  await pool.query("update public.ajustes set produccion = $1::jsonb", [JSON.stringify(BASE)])
  await configurarServicios()
  await simularMedios(page)
})

test.afterAll(async () => {
  await pool.query("delete from vault.secrets where name in ('heygen', 'elevenlabs')")
  await pool.query("delete from public.avisos_a_federico")
  await pool.query("update public.ajustes set produccion = '{}'::jsonb")
  await vaciarBiblioteca()
  await vaciarPiezasEIdeas()
})

test("a voice refused on its key: she tells Federico once, and the screen keeps saying it after a reload", async ({
  page,
  context,
}) => {
  const id = await vozConLlaveRechazada()
  await page.goto(`/guion/${id}`)
  await expect(voz(page).getByText(/Avísale a Federico/)).toHaveCount(0)
  await expect(voz(page).getByText("Cuando Federico lo arregle, puedes intentarlo otra vez.")).toBeVisible()
  await capturar(page, "avisar-voz-telefono", { completa: true })
  // A second screen opened before the first tap: its tap must not send a second email.
  const otra = await context.newPage()
  await simularMedios(otra)
  await otra.goto(`/guion/${id}`)

  await voz(page).getByRole("button", { name: AVISAR }).click()
  await expect(voz(page).getByText(LE_AVISE)).toBeVisible()
  await voz(otra).getByRole("button", { name: AVISAR }).click()
  await expect(voz(otra).getByText(LE_AVISE)).toBeVisible()
  await otra.close()

  const correos = await correosAWav()
  expect(correos).toHaveLength(1)
  expect(correos[0]).toMatchObject({ subject: `Coni te avisa: «${TITULO}»`, to: ["wav@estudio.test"] })

  await page.reload()
  await expect(voz(page).getByText(LE_AVISE)).toBeVisible()
  await expect(voz(page).getByRole("button", { name: AVISAR })).toHaveCount(0)
  await capturar(page, "avisar-voz-avisado-telefono", { completa: true })
})

test("a signed video stopped with an explanation offers the button in her words", async ({ page }) => {
  const id = await sembrarPieza("en_render", { explicacion: DETENIDO })
  await page.goto(`/guion/${id}`)

  const bloque = page.getByRole("alert").filter({ hasText: "El video está detenido" })
  await expect(bloque.getByText("No puedo seguir grabando por ahora.")).toBeVisible()
  await expect(bloque.getByText(/Avísale a Federico/)).toHaveCount(0)
  await expect(bloque.getByRole("button", { name: AVISAR })).toBeVisible()
  await capturar(page, "avisar-video-telefono", { completa: true })
})

test("a ready strategy material whose card cannot be read offers the button, not «reprocesa»", async ({ page }) => {
  const id = await fichaIlegible()
  await page.goto(`/biblioteca/materiales/${id}`)

  await expect(page.getByRole("heading", { name: TITULO_ESTRATEGIA })).toBeVisible()
  await expect(page.getByText("No pude leer la ficha de este material.")).toBeVisible()
  await expect(page.getByText(/Cambiaste quién es para ti/)).toHaveCount(0)
  await page.getByRole("button", { name: AVISAR }).click()
  await expect(page.getByText(LE_AVISE)).toBeVisible()
  expect(await correosAWav()).toHaveLength(1)
  await capturar(page, "avisar-material-telefono", { completa: true })
})

test("a voice the ElevenLabs balance does not cover: the button beside it, one email, and it stays told", async ({
  page,
}) => {
  await configurarServicios({ elevenlabsUsados: 100_000 })
  await conLlavesDeSaldo()
  const id = await sembrarPieza("guion_por_aprobar", { guion: GUION_VALIDO, texto: TEXTO_VALIDO })
  await ajustarPieza(id, { audio_id: null, titulo: TITULO })
  await page.goto(`/guion/${id}`)

  await expect(voz(page).getByText("No alcanza el saldo para preparar tu voz.", { exact: true })).toBeVisible()
  await expect(page.getByText(/Avísale a Federico/)).toHaveCount(0)
  await capturar(page, "avisar-saldo-voz-telefono", { completa: true })
  await voz(page).getByRole("button", { name: AVISAR }).click()
  await expect(voz(page).getByText(LE_AVISE)).toBeVisible()

  const correos = await correosAWav()
  expect(correos).toHaveLength(1)
  expect(correos[0]).toMatchObject({ subject: `Coni te avisa: «${TITULO}»`, to: ["wav@estudio.test"] })
  await page.reload()
  await expect(voz(page).getByText(LE_AVISE)).toBeVisible()
  await expect(voz(page).getByRole("button", { name: AVISAR })).toHaveCount(0)
})

test("a signature HeyGen's balance does not cover offers the button in the block at the top", async ({ page }) => {
  await configurarServicios({ heygenSaldo: 0 })
  await conLlavesDeSaldo()
  const id = await sembrarPieza("guion_por_aprobar", { guion: GUION_VALIDO, texto: TEXTO_VALIDO })
  await ajustarPieza(id, { audio_id: null, titulo: TITULO })
  await page.goto(`/guion/${id}`)

  const arriba = page.getByTestId("bloqueo-de-firma")
  await expect(arriba.getByText("No alcanza el saldo para grabar el video.")).toBeVisible()
  await arriba.getByRole("button", { name: AVISAR }).click()
  await expect(arriba.getByText(LE_AVISE)).toBeVisible()
  expect(await correosAWav()).toHaveLength(1)
})

test("a stopped video keeps the phone's single column: the piece above what happened", async ({ page }) => {
  const id = await sembrarPieza("en_render", { explicacion: DETENIDO })
  await ajustarPieza(id, { titulo: TITULO })
  await page.goto(`/guion/${id}`)

  const pieza = await page.getByTestId("estado-pieza").boundingBox()
  const principal = await page.getByTestId("estado-principal").boundingBox()
  expect(pieza && principal).toBeTruthy()
  if (!pieza || !principal) return
  expect(principal.y).toBeGreaterThanOrEqual(pieza.y + pieza.height)
  expect(Math.abs(principal.x - pieza.x)).toBeLessThanOrEqual(1)
  await expect(page.getByRole("link", { name: "Volver a Inicio" })).toBeVisible()
})
