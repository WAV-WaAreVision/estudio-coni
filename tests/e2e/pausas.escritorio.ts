import { readFileSync } from "node:fs"
import { join } from "node:path"
import { expect, type Page, test } from "@playwright/test"
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
import { sembrarBiblioteca, vaciarBiblioteca } from "./biblioteca-escena"
import { avatarYaVisto } from "./escena"
import { cajaDe, firmaDe, sobraDeAncho } from "./medidas-de-escritorio"

// Provider pauses on a computer, 1280 x 900 (spec 2026-11-07). Measured and captured, no baselines.
const BASE = JSON.parse(readFileSync(join(__dirname, "..", "fixtures", "coni.config.json"), "utf-8"))
const LOOKS = [{ avatar_id: "look-a", nombre: "Estudio", imagen: "avatares/look-a.png" }]
const CONFIG = { ...BASE, heygen: { ...BASE.heygen, avatares: LOOKS } }
const PAUSA_VOZ = "Tu voz está en pausa. Ya le avisamos a WAV."
const PAUSA_VIDEO = "Tu video está en pausa. Ya le avisamos a WAV."
const PAUSA_CLAUDE = "Las ideas y los guiones están en pausa. Ya le avisamos a WAV."
const PAUSA_BIBLIOTECA = "La Biblioteca está en pausa. Ya le avisamos a WAV."

async function abrirPausa(proveedor: string, motivo = "pago"): Promise<string> {
  const { rows } = await pool.query<{ pausa_id: string }>(
    "select pausa_id from public.abrir_pausa_de_proveedor($1, $2, 'e2e')",
    [proveedor, motivo],
  )
  const id = rows[0]?.pausa_id
  if (!id) throw new Error(`No se abrió la pausa de ${proveedor}`)
  return id
}

const cerrarPausa = (id: string) => pool.query("select public.cerrar_pausa_de_proveedor($1)", [id])

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await bloquearRedExterna(page)
  await vaciarPiezasEIdeas()
  await pool.query("delete from public.pausas_de_proveedor")
  await pool.query("update public.ajustes set produccion = $1::jsonb", [JSON.stringify(CONFIG)])
  for (const nombre of ["heygen", "elevenlabs"]) {
    await pool.query("delete from vault.secrets where name = $1", [nombre])
    await pool.query("select vault.create_secret($1, $2)", [`llave-de-${nombre}-e2e`, nombre])
  }
  await configurarServicios()
  await simularMedios(page)
  await avatarYaVisto()
})

test.afterAll(async () => {
  await pool.query("delete from public.pausas_de_proveedor")
  await pool.query("delete from vault.secrets where name in ('heygen', 'elevenlabs')")
  await pool.query("update public.ajustes set produccion = '{}'::jsonb")
  await vaciarBiblioteca()
  await vaciarPiezasEIdeas()
})

async function gateUnoConVozEnPausa(page: Page): Promise<string> {
  const id = await sembrarPieza("guion_por_aprobar", { guion: GUION_VALIDO, texto: TEXTO_VALIDO })
  await ajustarPieza(id, { audio_id: null, explicacion: PAUSA_VOZ })
  const pausa = await abrirPausa("elevenlabs")
  await page.goto(`/guion/${id}`)
  await expect(page.getByRole("heading", { name: "2. Revisa el guion" })).toBeVisible()
  return pausa
}

test("gate 1 with a paused voice keeps its two columns, says the pause once, and opens when it closes", async ({
  page,
}) => {
  const pausa = await gateUnoConVozEnPausa(page)
  const voz = page.getByRole("region", { name: "1. Escucha tu voz" })
  await expect(voz.getByText(PAUSA_VOZ)).toHaveCount(1)
  await expect(voz.getByRole("button", { name: /Preparar mi voz/ })).toHaveAttribute("aria-disabled", "true")
  // The width is used: the signature column stands right of the reading column, nothing scrolls sideways.
  const lectura = await cajaDe(page.locator("section[aria-labelledby=guion]"))
  expect((await cajaDe(firmaDe(page))).left).toBeGreaterThanOrEqual(lectura.right)
  expect(await sobraDeAncho(page)).toBeLessThanOrEqual(0)
  expect(await revisarConAxe(page, "voz en pausa en computador")).toEqual([])
  await capturar(page, "pausa-voz-escritorio", { completa: true })

  await cerrarPausa(pausa)
  await page.reload()
  await expect(voz.getByText("Falta preparar tu voz.")).toBeVisible()
  await expect(voz.getByRole("button", { name: /Preparar mi voz/ })).not.toHaveAttribute("aria-disabled", "true")
  await capturar(page, "pausa-voz-cerrada-escritorio", { completa: true })
})

test("a failed video with HeyGen paused disables «Reintentar» on a computer", async ({ page }) => {
  const id = await sembrarPieza("en_render", {
    estado: "error_produccion",
    estado_antes_del_error: "en_render",
    explicacion: PAUSA_VIDEO,
  })
  await abrirPausa("heygen", "cuota")
  await page.goto(`/guion/${id}`)
  await expect(page.getByRole("button", { name: "Reintentar" })).toHaveAttribute("aria-disabled", "true")
  await expect(page.getByText(PAUSA_VIDEO)).toHaveCount(1)
  expect(await sobraDeAncho(page)).toBeLessThanOrEqual(0)
  expect(await revisarConAxe(page, "video en pausa en computador")).toEqual([])
  await capturar(page, "pausa-video-escritorio", { completa: true })
})

test("the Biblioteca with Claude paused closes «Reintentar», «Subir» and «Proponer ahora»; a Voyage pause closes nothing", async ({
  page,
}) => {
  const escena = await sembrarBiblioteca()
  const claude = await abrirPausa("claude", "cuota")

  await page.goto(`/biblioteca?m=${escena.conError}`)
  const panel = page.getByRole("region", { name: "Notas del taller de TDAH adulto" })
  await expect(panel.getByRole("button", { name: "Reintentar" })).toHaveAttribute("aria-disabled", "true")
  await expect(panel.getByText(PAUSA_BIBLIOTECA)).toBeVisible()
  expect(await sobraDeAncho(page)).toBeLessThanOrEqual(0)
  expect(await revisarConAxe(page, "biblioteca en pausa en computador")).toEqual([])
  await capturar(page, "pausa-biblioteca-escritorio", { completa: true })

  await page.goto("/biblioteca/subir")
  await expect(page.getByRole("button", { name: "Subir" })).toHaveAttribute("aria-disabled", "true")
  await expect(page.getByText(PAUSA_BIBLIOTECA)).toBeVisible()
  expect(await revisarConAxe(page, "subir en pausa en computador")).toEqual([])
  await capturar(page, "pausa-subir-escritorio", { completa: true })

  await page.goto("/biblioteca/semana")
  await expect(page.getByRole("button", { name: "Proponer ahora" })).toHaveAttribute("aria-disabled", "true")
  await expect(page.getByText(PAUSA_CLAUDE)).toBeVisible()
  await capturar(page, "pausa-semana-escritorio", { completa: true })

  await cerrarPausa(claude)
  await abrirPausa("voyage", "llave")
  await page.goto(`/biblioteca?m=${escena.conError}`)
  await expect(panel.getByRole("button", { name: "Reintentar" })).not.toHaveAttribute("aria-disabled", "true")
  await expect(page.getByText(PAUSA_BIBLIOTECA)).toHaveCount(0)
  await page.goto("/biblioteca/subir")
  await expect(page.getByRole("button", { name: "Subir" })).not.toHaveAttribute("aria-disabled", "true")
  await capturar(page, "pausa-subir-solo-voyage-escritorio", { completa: true })
})

test("Inicio on a computer says the open pause and drops it once it closes", async ({ page }) => {
  const pausa = await abrirPausa("elevenlabs", "pago")
  await page.goto("/")
  const atencion = page.getByRole("region", { name: "Necesita atención" })
  await expect(
    atencion.getByText(
      "La voz está en pausa: la cuenta de ElevenLabs tiene un pago pendiente. WAV ya lo está resolviendo.",
    ),
  ).toBeVisible()
  expect(await sobraDeAncho(page)).toBeLessThanOrEqual(0)
  expect(await revisarConAxe(page, "inicio con pausa en computador")).toEqual([])
  await capturar(page, "pausa-inicio-escritorio", { completa: true })

  await cerrarPausa(pausa)
  await page.reload()
  await expect(page.getByText(/La voz está en pausa/)).toHaveCount(0)
  await capturar(page, "pausa-inicio-cerrada-escritorio", { completa: true })
})
