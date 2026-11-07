import { readFileSync } from "node:fs"
import { join } from "node:path"
import { expect, type Page, test } from "@playwright/test"
import { pool } from "../integration/db"
import { ajustarPieza, sembrarPieza, vaciarPiezasEIdeas } from "../integration/siembra"
import { capturar, configurarServicios, GUION_VALIDO, simularMedios, TEXTO_VALIDO } from "./ayudas"
import { sembrarBiblioteca, vaciarBiblioteca } from "./biblioteca-escena"

// Provider pauses on the phone (spec 2026-11-07): what Coni sees while a provider is paused, and after it closes.
const BASE = JSON.parse(readFileSync(join(__dirname, "..", "fixtures", "coni.config.json"), "utf-8"))
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

async function vozEnPausa(page: Page): Promise<{ id: string; pausa: string }> {
  const id = await sembrarPieza("guion_por_aprobar", { guion: GUION_VALIDO, texto: TEXTO_VALIDO })
  await ajustarPieza(id, { audio_id: null, explicacion: PAUSA_VOZ })
  const pausa = await abrirPausa("elevenlabs")
  await simularMedios(page)
  await page.goto(`/guion/${id}`)
  return { id, pausa }
}

test.beforeEach(async () => {
  await vaciarPiezasEIdeas()
  await pool.query("delete from public.pausas_de_proveedor")
  await pool.query("update public.ajustes set produccion = $1::jsonb", [JSON.stringify(BASE)])
  for (const nombre of ["heygen", "elevenlabs"]) {
    await pool.query("delete from vault.secrets where name = $1", [nombre])
    await pool.query("select vault.create_secret($1, $2)", [`llave-de-${nombre}-e2e`, nombre])
  }
  await configurarServicios()
})

test.afterAll(async () => {
  await pool.query("delete from public.pausas_de_proveedor")
  await pool.query("delete from vault.secrets where name in ('heygen', 'elevenlabs')")
  await pool.query("update public.ajustes set produccion = '{}'::jsonb")
  await vaciarBiblioteca()
  await vaciarPiezasEIdeas()
})

test("a paused voice shows its text and no active «Preparar mi voz»; when the pause closes the button is back", async ({
  page,
}) => {
  const { pausa } = await vozEnPausa(page)
  const voz = page.getByRole("region", { name: "1. Escucha tu voz" })
  await expect(voz.getByText(PAUSA_VOZ)).toHaveCount(1)
  await expect(voz.getByRole("button", { name: /Preparar mi voz/ })).toHaveAttribute("aria-disabled", "true")
  await expect(voz.getByText("Avísale a Federico")).toHaveCount(0)
  await capturar(page, "pausa-voz-telefono", { completa: true })

  await cerrarPausa(pausa)
  await page.reload()
  await expect(voz.getByText("Falta preparar tu voz.")).toBeVisible()
  await expect(voz.getByText(PAUSA_VOZ)).toHaveCount(0)
  await expect(voz.getByRole("button", { name: /Preparar mi voz/ })).not.toHaveAttribute("aria-disabled", "true")
  await capturar(page, "pausa-voz-cerrada-telefono", { completa: true })
})

test("a paused HeyGen disables «Reintentar» of a failed video and says it once", async ({ page }) => {
  const id = await sembrarPieza("en_render", {
    estado: "error_produccion",
    estado_antes_del_error: "en_render",
    explicacion: PAUSA_VIDEO,
  })
  const pausa = await abrirPausa("heygen", "cuota")
  await simularMedios(page)
  await page.goto(`/guion/${id}`)
  await expect(page.getByRole("button", { name: "Reintentar" })).toHaveAttribute("aria-disabled", "true")
  await expect(page.getByText(PAUSA_VIDEO)).toHaveCount(1)
  await capturar(page, "pausa-video-telefono", { completa: true })

  await cerrarPausa(pausa)
  await page.reload()
  await expect(page.getByRole("button", { name: "Reintentar" })).not.toHaveAttribute("aria-disabled", "true")
  await expect(page.getByText(PAUSA_VIDEO)).toHaveCount(0)
  await capturar(page, "pausa-video-cerrada-telefono", { completa: true })
})

test("a paused Claude disables «Proponer ahora» and the Biblioteca's «Reintentar»", async ({ page }) => {
  await sembrarBiblioteca()
  const pausa = await abrirPausa("claude", "cuota")

  await page.goto("/biblioteca/semana")
  await expect(page.getByRole("button", { name: "Proponer ahora" })).toHaveAttribute("aria-disabled", "true")
  await expect(page.getByText(PAUSA_CLAUDE)).toBeVisible()
  await capturar(page, "pausa-semana-telefono", { completa: true })

  await page.goto("/biblioteca?estado=fallido")
  await expect(page.getByRole("button", { name: "Reintentar" }).first()).toHaveAttribute("aria-disabled", "true")
  await expect(page.getByText(PAUSA_BIBLIOTECA).first()).toBeVisible()
  await capturar(page, "pausa-biblioteca-telefono", { completa: true })

  await cerrarPausa(pausa)
  await page.reload()
  await expect(page.getByRole("button", { name: "Reintentar" }).first()).not.toHaveAttribute("aria-disabled", "true")
  await expect(page.getByText(PAUSA_BIBLIOTECA)).toHaveCount(0)
  await capturar(page, "pausa-biblioteca-cerrada-telefono", { completa: true })
})

test("Inicio says an open pause with its reason, and stops saying it when the pause closes", async ({ page }) => {
  const pausa = await abrirPausa("heygen", "cuota")
  await abrirPausa("voyage", "llave")
  await page.goto("/")
  const atencion = page.getByRole("region", { name: "Necesita atención" })
  await expect(
    atencion.getByText(
      "Los videos están en pausa: la cuenta de HeyGen se quedó sin créditos. WAV ya lo está resolviendo.",
    ),
  ).toBeVisible()
  await expect(page.getByText(/Voyage|La Biblioteca está en pausa/)).toHaveCount(0)
  await capturar(page, "pausa-inicio-telefono", { completa: true })

  await cerrarPausa(pausa)
  await page.reload()
  await expect(page.getByText(/Los videos están en pausa/)).toHaveCount(0)
  await capturar(page, "pausa-inicio-cerrada-telefono", { completa: true })
})
